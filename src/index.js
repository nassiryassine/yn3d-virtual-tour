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

  // Public portfolio endpoints: only published projects are exposed.
  if (path === "/api/public/projects" && method === "GET") {
    const result = await env.DB.prepare(
      "SELECT p.id, p.title, p.slug, p.description, p.location, p.cover_image, p.status, p.sort_order, c.name AS category_name FROM projects p LEFT JOIN categories c ON c.id = p.category_id WHERE p.status = 'published' ORDER BY p.sort_order, p.id DESC"
    ).all();
    return json({ projects: result.results || [] });
  }

  const publicProjectMatch = path.match(/^\/api\/public\/projects\/([^/]+)$/);
  if (publicProjectMatch && method === "GET") {
    const slug = decodeURIComponent(publicProjectMatch[1]);
    const project = await env.DB.prepare(
      "SELECT p.id, p.title, p.slug, p.description, p.location, p.cover_image, p.status, c.name AS category_name FROM projects p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ? AND p.status = 'published' LIMIT 1"
    ).bind(slug).first();
    if (!project) return json({ error: "المشروع غير موجود أو غير منشور." }, 404);
    const media = await env.DB.prepare(
      "SELECT id, github_path, image_url, image_type, sort_order FROM project_images WHERE project_id = ? ORDER BY sort_order, id"
    ).bind(project.id).all();
    return json({ project, media: media.results || [] });
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

  const projectCoverMatch = path.match(/^\/api\/projects\/(\d+)\/cover$/);
  if (projectCoverMatch && method === "PUT") {
    const projectId = Number(projectCoverMatch[1]);
    const body = await request.json().catch(() => ({}));
    const image = await env.DB.prepare(
      "SELECT id, image_url FROM project_images WHERE id = ? AND project_id = ? AND image_type IN ('cover', 'gallery', 'image')"
    ).bind(Number(body.image_id), projectId).first();
    if (!image) return json({ error: "الصورة المحددة غير موجودة ضمن صور هذا المشروع." }, 404);
    await env.DB.prepare(
      "UPDATE project_images SET image_type = CASE WHEN id = ? THEN 'cover' ELSE 'gallery' END WHERE project_id = ? AND image_type IN ('cover', 'gallery', 'image')"
    ).bind(image.id, projectId).run();
    await env.DB.prepare("UPDATE projects SET cover_image = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?")
      .bind(image.image_url, projectId).run();
    return json({ ok: true, cover_image: image.image_url });
  }

  const deleteProjectImageMatch = path.match(/^\/api\/projects\/(\d+)\/images\/(\d+)$/);
  if (deleteProjectImageMatch && method === "DELETE") {
    const projectId = Number(deleteProjectImageMatch[1]);
    const imageId = Number(deleteProjectImageMatch[2]);
    const image = await env.DB.prepare(
      "SELECT id, image_url, image_type FROM project_images WHERE id = ? AND project_id = ? AND image_type IN ('cover', 'gallery', 'image')"
    ).bind(imageId, projectId).first();
    if (!image) return json({ error: "الصورة غير موجودة ضمن صور هذا المشروع." }, 404);
    const project = await env.DB.prepare("SELECT cover_image FROM projects WHERE id = ?").bind(projectId).first();
    await env.DB.prepare("DELETE FROM project_images WHERE id = ? AND project_id = ?").bind(imageId, projectId).run();
    const tourRows=await env.DB.prepare("SELECT id, github_path FROM project_images WHERE project_id = ? AND image_type = 'externalTour'").bind(projectId).all();
    for(const tour of tourRows.results||[]){
      try{
        const metadata=JSON.parse(tour.github_path||"");
        if(metadata&&typeof metadata==="object"&&metadata.coverImage===image.image_url){
          metadata.coverImage="";
          await env.DB.prepare("UPDATE project_images SET github_path = ? WHERE id = ? AND project_id = ?").bind(JSON.stringify(metadata),tour.id,projectId).run();
        }
      }catch{}
    }
    let coverImage = project ? project.cover_image : null;
    if (coverImage === image.image_url || image.image_type === "cover") {
      const next = await env.DB.prepare(
        "SELECT id, image_url FROM project_images WHERE project_id = ? AND image_type IN ('cover', 'gallery', 'image') ORDER BY sort_order, id LIMIT 1"
      ).bind(projectId).first();
      coverImage = next ? next.image_url : null;
      await env.DB.prepare("UPDATE projects SET cover_image = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?")
        .bind(coverImage, projectId).run();
      if (next) {
        await env.DB.prepare("UPDATE project_images SET image_type='cover' WHERE project_id = ? AND id = ?")
          .bind(projectId, next.id).run();
      }
    }
    const remaining = await env.DB.prepare(
      "SELECT id, image_url, image_type, sort_order FROM project_images WHERE project_id = ? AND image_type IN ('cover', 'gallery', 'image') ORDER BY sort_order, id"
    ).bind(projectId).all();
    return json({ ok: true, images: remaining.results || [], cover_image: coverImage });
  }

  const panoramaDeleteMatch = path.match(/^\/api\/projects\/(\d+)\/panoramas\/(\d+)$/);
  if (panoramaDeleteMatch && method === "DELETE") {
    const projectId = Number(panoramaDeleteMatch[1]), imageId = Number(panoramaDeleteMatch[2]);
    const result = await env.DB.prepare("DELETE FROM project_images WHERE id = ? AND project_id = ? AND image_type = 'tour360'").bind(imageId, projectId).run();
    if (!result.meta.changes) return json({ error: "مشهد 360° غير موجود." }, 404);
    const remaining = await env.DB.prepare("SELECT id FROM project_images WHERE project_id = ? AND image_type = 'tour360' ORDER BY sort_order, id").bind(projectId).all();
    for (let i = 0; i < (remaining.results || []).length; i++) {
      await env.DB.prepare("UPDATE project_images SET sort_order = ? WHERE id = ? AND project_id = ?").bind(i, remaining.results[i].id, projectId).run();
    }
    return json({ ok: true });
  }
  const panoramaOrderMatch = path.match(/^\/api\/projects\/(\d+)\/panoramas\/reorder$/);
  if (panoramaOrderMatch && method === "PUT") {
    const projectId = Number(panoramaOrderMatch[1]);
    const body = await request.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
    const current = await env.DB.prepare("SELECT id FROM project_images WHERE project_id = ? AND image_type = 'tour360' ORDER BY sort_order, id").bind(projectId).all();
    const valid = (current.results || []).map(x => Number(x.id));
    if (ids.length !== valid.length || ids.some(id => !valid.includes(id)) || new Set(ids).size !== ids.length) return json({ error: "قائمة ترتيب المشاهد غير صالحة." }, 400);
    for (let i = 0; i < ids.length; i++) {
      await env.DB.prepare("UPDATE project_images SET sort_order = ? WHERE id = ? AND project_id = ? AND image_type = 'tour360'").bind(i, ids[i], projectId).run();
    }
    return json({ ok: true });
  }

  const projectAudioMatch=path.match(/^\/api\/projects\/(\d+)\/audio$/);
  if(projectAudioMatch&&method==="DELETE"){const projectId=Number(projectAudioMatch[1]);await env.DB.prepare("DELETE FROM project_images WHERE project_id = ? AND image_type = 'projectAudio'").bind(projectId).run();return json({ok:true});}
  const projectMediaMatch = path.match(/^\/api\/projects\/(\d+)\/media$/);
  if (projectMediaMatch && method === "GET") {
    const projectId = Number(projectMediaMatch[1]);
    const result = await env.DB.prepare(
      "SELECT id, github_path, image_url, image_type, sort_order FROM project_images WHERE project_id = ? ORDER BY image_type, sort_order, id"
    ).bind(projectId).all();
    const project = await env.DB.prepare("SELECT cover_image FROM projects WHERE id = ?").bind(projectId).first();
    return json({ media: result.results || [], cover_image: project ? project.cover_image : null });
  }
  if (projectMediaMatch && method === "PUT") {
    const projectId = Number(projectMediaMatch[1]);
    const exists = await env.DB.prepare("SELECT id FROM projects WHERE id = ?").bind(projectId).first();
    if (!exists) return json({ error: "المشروع غير موجود." }, 404);
    const body = await request.json().catch(() => ({}));
    const videos = Array.isArray(body.videos) ? body.videos : [];
    const validUrl = value => {
      const valueText = String(value || "").trim();
      return valueText.startsWith("https://") || valueText.startsWith("http://") || valueText.startsWith("/");
    };
    if (videos.some(value => !validUrl(value))) {
      return json({ error: "يجب إدخال روابط صحيحة تبدأ بـ https:// أو http:// أو /." }, 400);
    }
    // Replace video links only. Keep legacy external tour links and uploaded 360° panoramas intact.
    await env.DB.prepare("DELETE FROM project_images WHERE project_id = ? AND image_type = 'video'").bind(projectId).run();
    for (let i = 0; i < videos.length; i++) {
      const value = String(videos[i]).trim();
      if (!value) continue;
      await env.DB.prepare(
        "INSERT INTO project_images (project_id, github_path, image_url, image_type, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).bind(projectId, "external-video-" + projectId + "-" + i, value, "video", i).run();
    }
    if (Object.prototype.hasOwnProperty.call(body,"panoeeTours") || Object.prototype.hasOwnProperty.call(body,"tourSource")) {
      let tours=Array.isArray(body.panoeeTours)?body.panoeeTours:[];
      if(!Object.prototype.hasOwnProperty.call(body,"panoeeTours")&&body.tourSource==="panoee"&&body.panoeeUrl)tours=[{name:"جولة 1",url:body.panoeeUrl}];
      const normalized=[];
      for(const item of tours){
        const name=String(item?.name||"").trim(),value=String(item?.url||"").trim();
        if(!name||!value)return json({error:"يرجى إدخال مسمّى ورابط لكل جولة."},400);
        let parsed;try{parsed=new URL(value);}catch{return json({error:"رابط Panoee غير صالح."},400);}
        if(parsed.protocol!=="https:"||parsed.hostname!=="tour.panoee.net"||!/^\/[A-Za-z0-9_-]+(?:\/.*)?$/.test(parsed.pathname))return json({error:"يرجى إدخال رابط جولة صحيح من tour.panoee.net."},400);
        const coverImage=String(item?.coverImage||"").trim();
        if(coverImage){
          const cover=await env.DB.prepare("SELECT id FROM project_images WHERE project_id = ? AND image_url = ? AND image_type IN ('cover','gallery','image') LIMIT 1").bind(projectId,coverImage).first();
          if(!cover)return json({error:"صورة غلاف الجولة يجب أن تكون من صور هذا المشروع المحفوظة."},400);
        }
        normalized.push({name,url:parsed.href,coverImage});
      }
      await env.DB.prepare("DELETE FROM project_images WHERE project_id = ? AND image_type = 'externalTour'").bind(projectId).run();
      for(let i=0;i<normalized.length;i++){
        const metadata=JSON.stringify({name:normalized[i].name,coverImage:normalized[i].coverImage});
        await env.DB.prepare("INSERT INTO project_images (project_id, github_path, image_url, image_type, sort_order) VALUES (?, ?, ?, ?, ?)").bind(projectId,metadata,normalized[i].url,"externalTour",i).run();
      }
    }
    return json({ ok: true });
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
    if (!file || typeof file.arrayBuffer !== "function") return json({ error: "اختر ملفاً أولاً." }, 400);
    const isProjectAudio=String(form.get("image_type")||"")==="projectAudio";
    if(isProjectAudio?(file.type!=="audio/mpeg"&&!/\.mp3$/i.test(file.name||"")):!["image/jpeg","image/png","image/webp"].includes(file.type)){
      return json({error:isProjectAudio?"يرجى رفع ملف MP3 فقط.":"الصيغ المدعومة هي JPG وPNG وWEBP فقط."},415);
    }
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: "حجم الملف يتجاوز 20 ميجابايت. قلّل حجمه ثم أعد المحاولة." }, 413);
    const projectId = String(form.get("project_id") || "general").replace(/[^0-9]/g, "") || "general";
    const requestedType = String(form.get("image_type") || "image");
    const allowedTypes = ["image", "cover", "gallery", "tour360", "projectAudio"];
    if (!allowedTypes.includes(requestedType)) return json({ error: "نوع الصورة غير مسموح." }, 400);
    const imageType = requestedType;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const hash = Array.from(digest).map(value => value.toString(16).padStart(2, "0")).join("");
    const filename = hash.slice(0, 20) + "-" + safeFilename(file.name);
    const repoPath = "assets/uploads/" + projectId + "/" + filename;
    const githubPath = "/" + repoPath.split("/").map(encodeURIComponent).join("/");
    if (projectId !== "general") {
      const existing = await env.DB.prepare(
        "SELECT id, image_url, github_path, image_type FROM project_images WHERE project_id = ? AND github_path = ? LIMIT 1"
      ).bind(Number(projectId), repoPath).first();
      if (existing) return json({ ok: true, id: existing.id, path: repoPath, url: existing.image_url, duplicate: true });
    }
    let uploaded = null;
    let githubFile = null;
    try {
      githubFile = await githubRequest(env, "/contents" + githubPath + "?ref=" + encodeURIComponent(env.GITHUB_BRANCH));
    } catch (error) {
      if (!/not found|404/i.test(String(error.message || error))) throw error;
    }
    if (!githubFile) {
      uploaded = await githubRequest(env, "/contents" + githubPath, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Upload project image: " + filename,
          content: encodeBase64(bytes),
          branch: env.GITHUB_BRANCH
        })
      });
    }
    const rawUrl = githubFile && githubFile.download_url
      ? githubFile.download_url
      : "https://raw.githubusercontent.com/" + env.GITHUB_REPO + "/" + env.GITHUB_BRANCH + "/" + repoPath;
    if (projectId !== "general") {
      if(imageType==="projectAudio")await env.DB.prepare("DELETE FROM project_images WHERE project_id = ? AND image_type = 'projectAudio'").bind(Number(projectId)).run();
      const inserted = await env.DB.prepare(
        "INSERT INTO project_images (project_id, github_path, image_url, image_type, sort_order) VALUES (?, ?, ?, ?, ?)"
      ).bind(Number(projectId), repoPath, rawUrl, imageType, 0).run();
      var imageId = inserted.meta.last_row_id;
      if (String(form.get("is_cover") || "") === "true") {
        await env.DB.prepare("UPDATE projects SET cover_image=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(rawUrl, Number(projectId)).run();
      }
    }
    return json({ ok: true, id: typeof imageId === "number" ? imageId : null, path: repoPath, url: rawUrl, commit: uploaded && uploaded.commit && uploaded.commit.sha }, 201);
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
