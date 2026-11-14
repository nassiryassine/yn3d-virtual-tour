const SESSION_COOKIE = "yn3d_admin_session";
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}

function cookieValue(request, name) {
  const cookies = request.headers.get("Cookie") || "";
  const item = cookies.split(";").map(v => v.trim()).find(v => v.startsWith(name + "="));
  return item ? item.slice(name.length + 1) : "";
}

function toBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function constantTimeEqual(a, b) {
  const left = new TextEncoder().encode(String(a));
  const right = new TextEncoder().encode(String(b));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left[i] || 0) ^ (right[i] || 0);
  return diff === 0;
}

async function isAuthenticated(request, env) {
  if (!env.SESSION_SECRET) return false;
  const token = cookieValue(request, SESSION_COOKIE);
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expiry = Number(parts[0]);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = await sign(parts[0], env.SESSION_SECRET);
  return constantTimeEqual(parts[1], expected);
}

function sessionCookie(value, maxAge) {
  return SESSION_COOKIE + "=" + value + "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=" + maxAge;
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || "project";
}

function safeFilename(value) {
  const name = String(value || "image").split(/[\\/]/).pop();
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-100) || "image";
}

function encodeBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function githubRequest(env, path, options = {}) {
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO || !env.GITHUB_BRANCH) {
    throw new Error("GitHub is not configured yet. Add the GitHub secrets in Cloudflare first.");
  }
  const url = "https://api.github.com/repos/" + env.GITHUB_REPO + path;
  const response = await fetch(url, {
    ...options,
    headers: {
      "Authorization": "Bearer " + env.GITHUB_TOKEN,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "YN3D-Admin-Panel",
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body.message || ("GitHub request failed (" + response.status + ")");
    throw new Error(message);
  }
  return body;
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method !== "GET" && method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return json({ error: "Request origin rejected." }, 403);
  }

  if (path === "/api/login" && method === "POST") {
    if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
      return json({ error: "Admin credentials are not configured in Cloudflare yet." }, 503);
    }
    const body = await request.json().catch(() => ({}));
    const validUser = await constantTimeEqual(body.username || "", env.ADMIN_USERNAME);
    const validPass = await constantTimeEqual(body.password || "", env.ADMIN_PASSWORD);
    if (!validUser || !validPass) return json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة." }, 401);
    const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
    const token = expiry + "." + await sign(String(expiry), env.SESSION_SECRET);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie(token, SESSION_SECONDS)
      }
    });
  }

  if (path === "/api/logout" && method === "POST") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookie("", 0)
      }
    });
  }

  if (!(await isAuthenticated(request, env))) return json({ error: "يرجى تسجيل الدخول أولاً." }, 401);
  if (path === "/api/me" && method === "GET") return json({ ok: true });

  if (path === "/api/categories" && method === "GET") {
    const result = await env.DB.prepare("SELECT id, name, slug, sort_order FROM categories ORDER BY sort_order, name").all();
    return json({ categories: result.results || [] });
  }

  if (path === "/api/categories" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim();
    if (!name) return json({ error: "اسم التصنيف مطلوب." }, 400);
    const slug = slugify(body.slug || name);
    try {
      const result = await env.DB.prepare(
        "INSERT INTO categories (name, slug, sort_order) VALUES (?, ?, ?)"
      ).bind(name, slug, Number(body.sort_order) || 0).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    } catch (error) {
      return json({ error: "تعذر إنشاء التصنيف. ربما الاسم المختصر مستخدم بالفعل." }, 409);
    }
  }

  if (path === "/api/projects" && method === "GET") {
    const result = await env.DB.prepare(
      "SELECT p.*, c.name AS category_name FROM projects p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.sort_order, p.id DESC"
    ).all();
    return json({ projects: result.results || [] });
  }

  if (path === "/api/projects" && method === "POST") {
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "").trim();
    if (!title) return json({ error: "اسم المشروع مطلوب." }, 400);
    const slug = slugify(body.slug || title);
    try {
      const result = await env.DB.prepare(
        "INSERT INTO projects (title, slug, description, category_id, location, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        title, slug, String(body.description || ""), body.category_id ? Number(body.category_id) : null,
        String(body.location || ""), body.status === "published" ? "published" : "draft",
        Number(body.sort_order) || 0
      ).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    } catch (error) {
      return json({ error: "تعذر إنشاء المشروع. تحقق من عدم تكرار الرابط المختصر والتصنيف." }, 409);
    }
  }

  const projectMatch = path.match(/^\/api\/projects\/(\d+)$/);
  if (projectMatch && method === "PUT") {
    const id = Number(projectMatch[1]);
    const body = await request.json().catch(() => ({}));
    const existing = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first();
    if (!existing) return json({ error: "المشروع غير موجود." }, 404);
    const title = String(body.title ?? existing.title).trim();
    if (!title) return json({ error: "اسم المشروع مطلوب." }, 400);
    try {
      await env.DB.prepare(
        "UPDATE projects SET title=?, slug=?, description=?, category_id=?, location=?, cover_image=?, status=?, sort_order=?, updated_at=CURRENT_TIMESTAMP WHERE id=?"
      ).bind(
        title, slugify(body.slug ?? existing.slug), String(body.description ?? existing.description ?? ""),
        body.category_id === "" || body.category_id === null ? null : Number(body.category_id ?? existing.category_id) || null,
        String(body.location ?? existing.location ?? ""), String(body.cover_image ?? existing.cover_image ?? ""),
        body.status === "published" ? "published" : (body.status === "draft" ? "draft" : existing.status),
        Number(body.sort_order ?? existing.sort_order) || 0, id
      ).run();
      return json({ ok: true });
    } catch (error) {
      return json({ error: "تعذر حفظ التعديلات. تحقق من الرابط المختصر والتصنيف." }, 409);
    }
  }

  if (projectMatch && method === "DELETE") {
    const id = Number(projectMatch[1]);
    await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }

  if (path === "/api/upload" && method === "POST") {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") return json({ error: "اختر صورة أولاً." }, 400);
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return json({ error: "الصيغ المدعومة هي JPG وPNG وWEBP فقط." }, 415);
    }
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: "حجم الصورة يتجاوز 20 ميجابايت. قلّل حجمها ثم أعد المحاولة." }, 413);
    const projectId = String(form.get("project_id") || "general").replace(/[^0-9]/g, "") || "general";
    const imageType = String(form.get("image_type") || "image").slice(0, 30);
    const filename = Date.now() + "-" + safeFilename(file.name);
    const repoPath = "assets/uploads/" + projectId + "/" + filename;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encoded = encodeBase64(bytes);
    const githubPath = "/" + repoPath.split("/").map(encodeURIComponent).join("/");
    const uploaded = await githubRequest(env, "/contents" + githubPath, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Upload project image: " + filename,
        content: encoded,
        branch: env.GITHUB_BRANCH
      })
    });
    const rawUrl = "https://raw.githubusercontent.com/" + env.GITHUB_REPO + "/" + env.GITHUB_BRANCH + "/" + repoPath;
    if (projectId !== "general") {
      await env.DB.prepare(
        "INSERT INTO project_images (project_id, github_path, image_url, image_type, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).bind(Number(projectId), repoPath, rawUrl, imageType, 0).run();
      if (String(form.get("is_cover") || "") === "true") {
        await env.DB.prepare("UPDATE projects SET cover_image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(rawUrl, Number(projectId)).run();
      }
    }
    return json({ ok: true, path: repoPath, url: rawUrl, commit: uploaded.commit && uploaded.commit.sha }, 201);
  }

  return json({ error: "المسار غير موجود." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env);
      } catch (error) {
        return json({ error: error && error.message ? error.message : "حدث خطأ غير متوقع." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
