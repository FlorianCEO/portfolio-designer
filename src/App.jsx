import React, { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   PORTFOLIO DESIGNER — site public + interface d'administration
   Contenu publié : Supabase (si configuré) sinon public/data.json
   ============================================================ */

/* ---------- Supabase (base de données) ----------
   Variables acceptées (par ordre de priorité) :
   - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (fichier .env, Vercel manuel)
   - NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (intégration Vercel↔Supabase)
   Sans configuration valide, le site fonctionne en mode data.json.
   L'initialisation est défensive : une valeur malformée ne doit JAMAIS
   faire planter le site (page blanche). */
const env = import.meta.env;
const cleanEnv = (v) => (v || "").trim().replace(/^["']+|["']+$/g, "");
const SUPABASE_URL = cleanEnv(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = cleanEnv(
  env.VITE_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
);

let supabaseClient = null;
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY && /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)/i.test(SUPABASE_URL)) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  } else if (SUPABASE_URL || SUPABASE_ANON_KEY) {
    console.error(
      "[Portfolio] Configuration Supabase ignorée : URL invalide ou clé manquante.",
      "URL reçue :", SUPABASE_URL || "(vide)"
    );
  }
} catch (e) {
  console.error("[Portfolio] Impossible d'initialiser Supabase :", e);
}
const supabase = supabaseClient;
const SUPABASE_ENABLED = !!supabase;
if (SUPABASE_ENABLED) {
  console.info("[Portfolio] Supabase actif — projet :", SUPABASE_URL);
}

const ADMIN_EMAIL = "thomas@designisvital.co";
const ADMIN_PASS = "backtothefuture";
const DRAFT_KEY = "portfolio_draft_v1";
const PUBLISHED_KEY = "portfolio_published_v1";

/* Contenu intégré au code : garantit que TOUS les visiteurs voient ce contenu,
   même si le stockage partagé est inaccessible (visiteur non connecté, copie de
   l'artifact, etc.). Pour le mettre à jour : bouton "Exporter les données (JSON)"
   dans l'admin, puis demander à Claude d'intégrer le fichier ici. */
const EMBEDDED_PUBLISHED = null;

const uid = () => Math.random().toString(36).slice(2, 9);

/* ---------- Données par défaut (à remplacer via l'admin) ---------- */
const DEFAULT_DATA = {
  settings: {
    initials: "PD",
    name: "Prénom Nom",
    heroLine1: "Product designer avec X années d'expérience,",
    heroLine2: "qui rend les produits complexes évidents.",
    portrait: "",
    metaLine: "Product Designer · Paris · B2B SaaS & Design systems",
    available: true,
    availableLabel: "Disponible",
    unavailableLabel: "Indisponible",
  },
  clients: [
    { id: uid(), name: "Client A", image: "" },
    { id: uid(), name: "Client B", image: "" },
    { id: uid(), name: "Client C", image: "" },
    { id: uid(), name: "Client D", image: "" },
  ],
  projects: [
    {
      id: uid(),
      title: "Titre du projet",
      description:
        "Description du projet : contexte, problème, approche et résultats. Modifiez ce texte depuis l'interface d'administration.",
      years: "2025",
      role: "Product Designer",
      scope: "UI/UX, Design system, Prototyping, User testing",
      peoples: "",
      image: "",
      links: [{ id: uid(), label: "Behance", url: "" }],
      linkType: "internal", // none | external | internal
      externalUrl: "",
      page: {
        heading: "Titre éditorial de l'étude de cas",
        tldrTitle: "En bref",
        tldr: "Résumé du projet en quelques lignes : contexte, intervention, résultat.",
        sections: [
          {
            id: uid(),
            title: "Introduction",
            text: "Premier paragraphe de la section.\n\nSecond paragraphe.",
            image: "",
          },
        ],
        credits: [{ id: uid(), label: "Product Designer", value: "" }],
      },
    },
  ],
  about: {
    title: "Ma façon de travailler",
    text:
      "Présentez ici la méthode de travail du designer : outils, process, collaboration avec les équipes produit et tech.\n\nSecond paragraphe : ce qui rend son approche singulière.",
  },
  background: [
    {
      id: uid(),
      dates: "2022 → Aujourd'hui",
      title: "Product Designer — Freelance",
      description:
        "Décrivez la mission : contexte, responsabilités, clients, livrables.",
      logo: "",
    },
  ],
  contact: {
    heading: "Me contacter.",
    note: "Disponible pour une mission ou un poste.",
    terms: "Freelance / CDI · Paris / Remote",
    email: "prenom.nom@email.com",
    phone: "",
    links: [
      { id: uid(), label: "LinkedIn", url: "" },
      { id: uid(), label: "Calendly", url: "" },
      { id: uid(), label: "Malt", url: "" },
    ],
  },
};

/* ---------- Normalisation (migration des anciennes données) ---------- */
function normalizeData(raw) {
  const data = { ...JSON.parse(JSON.stringify(DEFAULT_DATA)), ...raw };
  data.projects = (data.projects || []).map((p) => ({
    peoples: "",
    linkType: "none",
    externalUrl: "",
    ...p,
    links: p.links || [],
    page: {
      heading: "",
      tldrTitle: "En bref",
      tldr: "",
      sections: [],
      credits: [],
      ...(p.page || {}),
    },
  }));
  return data;
}

/* ---------- Persistance (site autonome) ----------
   Brouillon : localStorage du navigateur de l'admin
   Publié    : public/data.json embarqué dans le déploiement */
function tryGetLocal(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch (e) {
    return null;
  }
}

async function loadPublished() {
  // 1) Base de données Supabase (si configurée)
  if (supabase) {
    try {
      const { data: row, error } = await supabase
        .from("portfolio")
        .select("data, published_at")
        .eq("id", 1)
        .maybeSingle();
      if (!error && row && row.data) {
        return { data: normalizeData(row.data), publishedAt: row.published_at };
      }
    } catch (e) {
      console.error("Lecture Supabase impossible", e);
    }
  }
  // 2) Repli : public/data.json (servi a la racine du site)
  try {
    const res = await fetch("/data.json", { cache: "no-store" });
    if (res.ok) {
      const pub = await res.json();
      if (pub && pub.data) return { ...pub, data: normalizeData(pub.data) };
    }
  } catch (e) {
    /* fichier absent : premier deploiement */
  }
  if (EMBEDDED_PUBLISHED && EMBEDDED_PUBLISHED.data) {
    return { ...EMBEDDED_PUBLISHED, data: normalizeData(EMBEDDED_PUBLISHED.data) };
  }
  return null;
}

async function loadDraft() {
  const draft = tryGetLocal(DRAFT_KEY);
  if (draft) return normalizeData(draft);
  const pub = await loadPublished();
  if (pub && pub.data) return normalizeData(pub.data);
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

async function saveDraft(data) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error("Erreur de sauvegarde du brouillon", e);
    return false;
  }
}

async function savePublished(data) {
  const payload = { data, publishedAt: new Date().toISOString() };
  // 1) Base de données Supabase : publication instantanée pour tous les visiteurs
  if (supabase) {
    try {
      const { error } = await supabase
        .from("portfolio")
        .upsert({ id: 1, data, published_at: payload.publishedAt });
      if (error) {
        console.error("Erreur de publication Supabase", error);
        return null;
      }
      return payload;
    } catch (e) {
      console.error("Erreur de publication Supabase", e);
      return null;
    }
  }
  // 2) Sans Supabase : telecharger le data.json a jour,
  //    a replacer dans public/data.json avant de redeployer.
  try {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return payload;
  } catch (e) {
    console.error("Erreur de publication", e);
    return null;
  }
}

/* ---------- Export HTML statique (pour hébergement externe) ---------- */
const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function buildStaticHtml(data) {
  const { settings: s, clients, projects, about, background, contact } = data;
  const pill = () =>
    `<span class="pf-pill ${s.available ? "ok" : "ko"}"><span class="pf-dot"></span>${esc(
      s.available ? s.availableLabel : s.unavailableLabel
    )}</span>`;

  const clientsHtml = clients.length
    ? `<section class="pf-clients"><div class="pf-container pf-clients-grid">${clients
        .map(
          (c) =>
            `<div class="pf-client" title="${esc(c.name)}">${
              c.image ? `<img src="${esc(c.image)}" alt="${esc(c.name)}">` : `<span>${esc(c.name)}</span>`
            }</div>`
        )
        .join("")}</div></section>`
    : "";

  const projectsHtml = projects
    .map((p) => {
      const links = (p.links || []).filter((l) => l.url);
      const isInternal = p.linkType === "internal";
      const isExternal = p.linkType === "external" && p.externalUrl;
      const openTag = isInternal
        ? `<a href="#project-${p.id}" style="text-decoration:none;color:inherit;display:block">`
        : isExternal
        ? `<a href="${esc(p.externalUrl)}" target="_blank" rel="noreferrer" style="text-decoration:none;color:inherit;display:block">`
        : "<div>";
      const closeTag = isInternal || isExternal ? "</a>" : "</div>";
      return `<article class="pf-project">
${openTag}<div class="pf-project-content"><h3>${esc(p.title)}${isInternal || isExternal ? " →" : ""}</h3><p>${esc(p.description)}</p><dl class="pf-meta">${
        p.years ? `<div class="pf-meta-row"><dt>Années</dt><dd>${esc(p.years)}</dd></div>` : ""
      }${p.role ? `<div class="pf-meta-row"><dt>Rôle</dt><dd>${esc(p.role)}</dd></div>` : ""}${
        p.scope ? `<div class="pf-meta-row"><dt>Périmètre</dt><dd>${esc(p.scope)}</dd></div>` : ""
      }${
        links.length
          ? `<div class="pf-meta-row"><dt>Liens</dt><dd>${links
              .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label || "Lien")} ↗</a>`)
              .join(" · ")}</dd></div>`
          : ""
      }</dl></div>${closeTag}
<div class="pf-project-visual">${
        p.image
          ? `<img class="pf-project-img" src="${esc(p.image)}" alt="${esc(p.title)}">`
          : `<div class="pf-project-imgph">Visuel du projet</div>`
      }</div>
</article>`;
    })
    .join("");

  const contactBlock = (topMargin) => {
    const contactLinks = [
      contact.email ? `<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : "",
      contact.phone ? `<a href="tel:${esc(contact.phone.replace(/\s/g, ""))}">${esc(contact.phone)}</a>` : "",
      ...contact.links.filter((l) => l.url).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noreferrer">${esc(l.label)}</a>`),
    ]
      .filter(Boolean)
      .join("");
    return `<section class="pf-section pf-contact"${topMargin ? ' style="border-bottom:none"' : ""} id="contact"><div class="pf-container"><h2>${esc(contact.heading)}</h2>${pill()}<div class="pf-contact-note" style="margin-top:14px">${esc(contact.note)}</div><div class="pf-contact-note">${esc(contact.terms)}</div><div class="pf-contact-row">${contactLinks}</div></div></section>`;
  };

  // Pages internes des projets (routées par hash #project-<id>)
  const projectPagesHtml = projects
    .filter((p) => p.linkType === "internal")
    .map((p) => {
      const pg = p.page || {};
      const sections = pg.sections || [];
      const anchorId = (sec, i) => `p${p.id}-sec-${i}`;
      const toc =
        sections.length > 1
          ? `<nav class="pp-toc"><div class="pp-toc-label">Sommaire</div><div class="pp-toc-list">${sections
              .map((sec, i) => `<a href="#${anchorId(sec, i)}" onclick="return scrollInPage('${anchorId(sec, i)}')">${esc(sec.title || `Section ${i + 1}`)}</a>`)
              .join("")}</div></nav>`
          : "";
      const sectionsHtml = sections
        .map(
          (sec, i) =>
            `<section class="pp-section" id="${anchorId(sec, i)}">${sec.title ? `<h3>${esc(sec.title)}</h3>` : ""}${(sec.text || "")
              .split(/\n\n+/)
              .filter(Boolean)
              .map((para) => `<p>${esc(para)}</p>`)
              .join("")}${sec.image ? `<img src="${esc(sec.image)}" alt="">` : ""}</section>`
        )
        .join("");
      const credits = (pg.credits || []).filter((c) => c.label || c.value);
      const creditsHtml = credits.length
        ? `<div class="pp-credits">${credits
            .map((c) => `<div><span>${esc(c.label)}</span>${esc(c.value)}</div>`)
            .join("")}</div>`
        : "";
      return `<div class="pp-page" id="project-page-${p.id}" style="display:none"><main class="pf-container">
<a class="pp-back" href="#work">← Retour aux projets</a>
<h1 class="pp-title">${esc(p.title)}</h1>
<dl class="pp-metagrid">${p.peoples ? `<div><dt>Équipe</dt><dd>${esc(p.peoples)}</dd></div>` : ""}${
        p.years ? `<div><dt>Années</dt><dd>${esc(p.years)}</dd></div>` : ""
      }${p.role ? `<div><dt>Rôle</dt><dd>${esc(p.role)}</dd></div>` : ""}${
        p.scope ? `<div><dt>Périmètre</dt><dd>${esc(p.scope)}</dd></div>` : ""
      }</dl>
${p.image ? `<img class="pp-hero-img" src="${esc(p.image)}" alt="${esc(p.title)}">` : ""}
${toc}
<article class="pp-article">${pg.heading ? `<h2>${esc(pg.heading)}</h2>` : ""}${
        pg.tldr
          ? `<div class="pp-tldr"><div class="pp-tldr-label">${esc(pg.tldrTitle || "En bref")}</div><p>${esc(pg.tldr)}</p></div>`
          : ""
      }${sectionsHtml}${creditsHtml}</article>
${contactBlock(true)}
</main></div>`;
    })
    .join("");

  const aboutHtml = (about.text || "")
    .split(/\n\n+/)
    .map((para) => `<p>${esc(para)}</p>`)
    .join("");

  const bgHtml = background
    .map(
      (j) =>
        `<article class="pf-job"><div class="pf-job-dates">${esc(j.dates)}</div>${
          j.logo
            ? `<img class="pf-job-logo" src="${esc(j.logo)}" alt="">`
            : `<div class="pf-job-logoph">Logo</div>`
        }<div><h3>${esc(j.title)}</h3><p>${esc(j.description)}</p></div></article>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr" style="scroll-behavior:smooth">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.name)} — Portfolio</title>
<meta name="description" content="${esc(s.metaLine)}">
<style>${CSS}</style>
</head>
<body style="margin:0">
<div class="pf-root" data-theme="light" id="root">
<header class="pf-header"><div class="pf-container pf-header-in">
<a class="pf-logo" href="#top" style="text-decoration:none">${esc(s.initials)}</a>
<nav class="pf-nav"><a href="#work">Projets</a><a href="#about">À propos</a><a href="#background">Parcours</a><a href="#contact">Contact</a></nav>
<div class="pf-header-right">${pill()}<button class="pf-theme" id="themeBtn">Sombre</button></div>
</div></header>
<div id="home">
<main id="top">
<section class="pf-hero pf-container">
<div class="pf-hero-name">${esc(s.name)}</div>
${s.portrait ? `<img class="pf-hero-portrait" src="${esc(s.portrait)}" alt="Portrait de ${esc(s.name)}">` : ""}
<h1>${esc(s.heroLine1)} ${esc(s.heroLine2)}</h1>
<div class="pf-hero-meta"><span>${esc(s.metaLine)}</span>${pill()}</div>
</section>
${clientsHtml}
<section class="pf-section" id="work"><div class="pf-container"><div class="pf-eyebrow">Projets sélectionnés</div>${projectsHtml}</div></section>
<section class="pf-section pf-about" id="about"><div class="pf-container"><div class="pf-eyebrow">${esc(about.title || "Ma façon de travailler")}</div>${aboutHtml}</div></section>
<section class="pf-section" id="background"><div class="pf-container"><div class="pf-eyebrow">Parcours</div>${bgHtml}</div></section>
${contactBlock(false)}
</main>
</div>
${projectPagesHtml}
<footer class="pf-footer pf-container"><span>© ${new Date().getFullYear()} ${esc(s.name)}</span></footer>
</div>
<script>
(function () {
  var root = document.getElementById("root");
  var btn = document.getElementById("themeBtn");
  function applyTheme(t, updateUrl) {
    root.setAttribute("data-theme", t);
    btn.textContent = t === "dark" ? "Clair" : "Sombre";
    if (updateUrl) {
      try {
        var u = new URL(window.location.href);
        u.searchParams.set("theme", t);
        window.history.replaceState({}, "", u);
      } catch (e) {}
    }
  }
  // Theme initial depuis l'URL (?theme=dark ou ?theme=light)
  var initial = "light";
  try {
    var pr = new URLSearchParams(window.location.search).get("theme");
    if (pr === "dark" || pr === "light") initial = pr;
  } catch (e) {}
  applyTheme(initial, false);
  btn.addEventListener("click", function () {
    applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark", true);
  });
})();
// Routage par hash : #project-<id> affiche la page interne du projet
function route() {
  var hash = location.hash || "";
  var home = document.getElementById("home");
  var pages = document.querySelectorAll(".pp-page");
  var match = hash.match(/^#project-(.+)$/);
  var target = match ? document.getElementById("project-page-" + match[1]) : null;
  pages.forEach(function (pg) { pg.style.display = "none"; });
  if (target) {
    home.style.display = "none";
    target.style.display = "block";
    window.scrollTo(0, 0);
  } else {
    home.style.display = "block";
    if (hash) {
      var el = document.querySelector(hash.replace(/[^#a-zA-Z0-9_-]/g, ""));
      if (el) el.scrollIntoView();
    }
  }
}
function scrollInPage(id) {
  var el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth" });
  return false;
}
window.addEventListener("hashchange", route);
route();
</script>
</body>
</html>`;
}

function downloadHtmlFile(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- Redimensionnement des images uploadées ---------- */
function fileToResizedDataUrl(file, maxDim = 1400, mime = "image/jpeg", quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lecture du fichier impossible"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Image invalide"));
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL(mime, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ---------- Import de CV (PDF -> extraction via l'API Claude) ---------- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(",")[1]);
    r.onerror = () => reject(new Error("Lecture du fichier impossible"));
    r.readAsDataURL(file);
  });
}

async function extractCvFromPdf(base64) {
  // L'appel passe par la fonction serverless /api/extract-cv,
  // qui garde la cle API Anthropic cote serveur.
  const response = await fetch("/api/extract-cv", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pdfBase64: base64 }),
  });
  let data = null;
  try {
    data = await response.json();
  } catch (e) {
    /* reponse non JSON */
  }
  if (!response.ok) {
    throw new Error(
      (data && data.error) ||
        "Le service d'import de CV n'est pas disponible sur ce deploiement."
    );
  }
  const experiences = (data && data.experiences) || [];
  if (!Array.isArray(experiences) || experiences.length === 0) {
    throw new Error("Aucune experience detectee dans ce PDF");
  }
  return experiences.map((e) => ({
    id: uid(),
    dates: e.dates || "",
    title: e.title || "",
    description: e.description || "",
    logo: "",
  }));
}

/* ---------- Styles ---------- */
const CSS = `
:root, [data-theme="light"] {
  --bg: #F6F5F1;
  --bg-soft: #EDECE6;
  --ink: #17160F;
  --muted: #75746B;
  --line: #DDDBD1;
  --card: #FFFFFF;
  --ok: #1C9E4F;
  --ok-soft: #E2F3E8;
  --ko: #B3352E;
  --ko-soft: #F7E5E3;
}
[data-theme="dark"] {
  --bg: #141412;
  --bg-soft: #1D1D1A;
  --ink: #F1F0EA;
  --muted: #96958B;
  --line: #2C2C27;
  --card: #1A1A17;
  --ok: #3CC873;
  --ok-soft: #12301D;
  --ko: #E06058;
  --ko-soft: #391512;
}
.pf-root {
  background: var(--bg); color: var(--ink);
  font-family: "Archivo", ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif;
  min-height: 100vh; -webkit-font-smoothing: antialiased;
  transition: background .3s ease, color .3s ease;
}
.pf-root * { box-sizing: border-box; }
.pf-container { max-width: 1120px; margin: 0 auto; padding: 0 24px; }
a { color: inherit; }

/* Header */
.pf-header {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.pf-header-in { display: flex; align-items: center; gap: 20px; height: 64px; }
.pf-logo {
  font-weight: 800; letter-spacing: -.03em; font-size: 18px;
  border: 1.5px solid var(--ink); border-radius: 8px; padding: 3px 8px;
  cursor: pointer; background: none; color: inherit;
}
.pf-nav { display: flex; gap: 18px; margin-left: 8px; }
.pf-nav a { text-decoration: none; font-size: 14px; color: var(--muted); }
.pf-nav a:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 4px; }
.pf-header-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.pf-pill {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 600; padding: 5px 12px; border-radius: 999px;
}
.pf-pill.ok { background: var(--ok-soft); color: var(--ok); }
.pf-pill.ko { background: var(--ko-soft); color: var(--ko); }
.pf-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; position: relative; }
.pf-pill.ok .pf-dot::after {
  content: ""; position: absolute; inset: -4px; border-radius: 50%;
  border: 2px solid currentColor; opacity: .4; animation: pfping 1.8s ease-out infinite;
}
@keyframes pfping { 0% { transform: scale(.5); opacity: .6; } 100% { transform: scale(1.4); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .pf-pill.ok .pf-dot::after { animation: none; } }
.pf-theme {
  border: 1px solid var(--line); background: var(--card); color: var(--ink);
  border-radius: 999px; padding: 5px 12px; font-size: 13px; cursor: pointer;
}

/* Hero */
.pf-hero { padding-top: 96px; padding-bottom: 56px; }
.pf-hero-name { font-size: 15px; color: var(--muted); margin-bottom: 20px; letter-spacing: .02em; }
.pf-hero h1 {
  font-size: clamp(34px, 6vw, 68px); line-height: 1.05; letter-spacing: -.035em;
  font-weight: 750; margin: 0;
}
.pf-hero-portrait {
  display: block;
  width: clamp(96px, 10vw, 132px); height: clamp(68px, 7vw, 92px);
  object-fit: cover; border-radius: 999px; margin: 0 0 28px;
  border: 1px solid var(--line); background: var(--bg-soft);
}
.pf-hero-meta { margin-top: 32px; font-size: 14px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; }

/* Logos clients */
.pf-clients { padding: 24px 0 64px; border-bottom: 1px solid var(--line); }
.pf-clients-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.pf-client {
  height: 64px; display: flex; align-items: center; justify-content: center;
  background: var(--card); border: 1px solid var(--line); border-radius: 10px;
  padding: 10px 14px; filter: grayscale(1); opacity: .75; transition: all .2s ease;
}
.pf-client:hover { filter: none; opacity: 1; }
.pf-client img { max-height: 32px; max-width: 100%; object-fit: contain; }
.pf-client span { font-size: 13px; font-weight: 600; color: var(--muted); text-align: center; }

/* Sections */
.pf-section { padding: 80px 0; border-bottom: 1px solid var(--line); }
.pf-eyebrow {
  font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 40px;
}

/* Projets */
.pf-project { display: grid; grid-template-columns: 1fr 1.15fr; gap: 48px; padding: 56px 0; border-top: 1px solid var(--line); align-items: stretch; }
.pf-project:first-of-type { border-top: none; padding-top: 0; }
.pf-project-content h3 { font-size: clamp(24px, 3vw, 34px); letter-spacing: -.02em; margin: 0 0 18px; font-weight: 700; }
.pf-project-content > p { font-size: 16px; line-height: 1.7; color: var(--muted); margin: 0 0 28px; max-width: 58ch; }
.pf-meta { margin: 0; }
.pf-meta-row { display: grid; grid-template-columns: 110px 1fr; gap: 16px; padding: 14px 0; border-top: 1px solid var(--line); }
.pf-meta-row dt { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); padding-top: 2px; }
.pf-meta-row dd { margin: 0; font-size: 14px; line-height: 1.55; }
.pf-meta-row a { text-decoration: underline; text-underline-offset: 3px; }
.pf-project-visual { position: relative; }
.pf-project-img {
  width: 100%; height: 100%; min-height: 420px; border-radius: 16px; border: 1px solid var(--line);
  background: var(--bg-soft); display: block; object-fit: cover; margin: 0;
}
.pf-project-imgph {
  width: 100%; height: 100%; min-height: 420px; border-radius: 16px; border: 1px dashed var(--line); background: var(--bg-soft);
  display: flex; align-items: center; justify-content: center; color: var(--muted); font-size: 13px;
}

/* About */
.pf-about p { font-size: clamp(17px, 2vw, 21px); line-height: 1.6; max-width: 68ch; margin: 0 0 20px; }

/* Background */
.pf-job { display: grid; grid-template-columns: 180px 56px 1fr; gap: 24px; padding: 36px 0; border-top: 1px solid var(--line); align-items: start; }
.pf-job:first-of-type { border-top: none; padding-top: 0; }
.pf-job-dates { font-size: 14px; color: var(--muted); white-space: pre-line; }
.pf-job-logo { width: 56px; height: 56px; border-radius: 12px; border: 1px solid var(--line); background: var(--card); object-fit: contain; padding: 8px; }
.pf-job-logoph { width: 56px; height: 56px; border-radius: 12px; border: 1px dashed var(--line); background: var(--bg-soft); display:flex; align-items:center; justify-content:center; font-size: 11px; color: var(--muted); }
.pf-job h3 { margin: 0 0 8px; font-size: 19px; letter-spacing: -.01em; }
.pf-job p { margin: 0; font-size: 15px; line-height: 1.65; color: var(--muted); max-width: 66ch; white-space: pre-line; }

/* Contact */
.pf-contact h2 { font-size: clamp(36px, 6vw, 64px); letter-spacing: -.035em; margin: 0 0 24px; font-weight: 750; }
.pf-contact-row { display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center; margin-top: 20px; font-size: 15px; }
.pf-contact-row a { text-decoration: underline; text-underline-offset: 4px; }
.pf-contact-note { color: var(--muted); font-size: 15px; }

/* Footer */
.pf-footer { padding-top: 32px; padding-bottom: 48px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--muted); }
.pf-footer button { background: none; border: none; color: var(--muted); font-size: 13px; cursor: pointer; text-decoration: underline; text-underline-offset: 3px; padding: 0; }
.pf-footer button:hover { color: var(--ink); }

/* Page projet interne */
.pf-project-clickable { cursor: pointer; }
.pf-project-clickable h3:hover { text-decoration: underline; text-underline-offset: 4px; }
.pp-back { display: inline-block; margin: 40px 0 32px; font-size: 14px; color: var(--muted); text-decoration: none; background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
.pp-back:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 4px; }
.pp-title { font-size: clamp(34px, 6vw, 64px); letter-spacing: -.035em; font-weight: 750; margin: 0 0 32px; }
.pp-metagrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 20px; margin: 0 0 40px; }
.pp-metagrid dt { font-size: 12px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
.pp-metagrid dd { margin: 5px 0 0; font-size: 14px; line-height: 1.5; }
.pp-hero-img { width: 100%; border-radius: 16px; border: 1px solid var(--line); background: var(--bg-soft); display: block; margin-bottom: 48px; }
.pp-toc { border: 1px solid var(--line); border-radius: 14px; background: var(--card); padding: 20px 22px; margin-bottom: 56px; }
.pp-toc-label { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); margin-bottom: 12px; font-weight: 700; }
.pp-toc a { font-size: 14px; text-decoration: none; color: var(--ink); }
.pp-toc a:hover { text-decoration: underline; text-underline-offset: 4px; }
.pp-toc-list { display: flex; flex-wrap: wrap; gap: 8px 18px; }
.pp-article { max-width: none; }
.pp-article h2 { font-size: clamp(26px, 4vw, 40px); letter-spacing: -.03em; line-height: 1.15; margin: 0 0 28px; font-weight: 750; }
.pp-tldr { border: 1px solid var(--line); border-left: 4px solid var(--ink); border-radius: 12px; background: var(--card); padding: 20px 22px; margin-bottom: 44px; }
.pp-tldr-label { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; font-weight: 700; margin-bottom: 8px; }
.pp-tldr p { margin: 0; font-size: 15px; line-height: 1.65; color: var(--muted); }
.pp-section { margin-bottom: 44px; scroll-margin-top: 90px; }
.pp-section h3 { font-size: clamp(19px, 2.4vw, 24px); letter-spacing: -.015em; margin: 0 0 14px; }
.pp-section p { font-size: 16px; line-height: 1.7; color: var(--muted); margin: 0 0 14px; }
.pp-section img { width: 100%; border-radius: 12px; border: 1px solid var(--line); margin: 8px 0 4px; display: block; }
.pp-credits { border-top: 1px solid var(--line); padding-top: 28px; margin-top: 56px; display: flex; flex-wrap: wrap; gap: 12px 40px; }
.pp-credits div { font-size: 14px; }
.pp-credits span { color: var(--muted); display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 4px; }

/* ---------- Admin ---------- */
.ad-wrap { min-height: 100vh; background: var(--bg); }
.ad-topbar { display: flex; align-items: center; gap: 16px; height: 60px; border-bottom: 1px solid var(--line); }
.ad-topbar h1 { font-size: 16px; margin: 0; font-weight: 700; letter-spacing: -.01em; }
.ad-topbar .sp { margin-left: auto; display: flex; gap: 10px; align-items: center; }
.ad-body { display: grid; grid-template-columns: 220px 1fr; gap: 32px; padding: 32px 0 80px; align-items: start; }
.ad-tabs { display: flex; flex-direction: column; gap: 4px; position: sticky; top: 92px; }
.ad-tab {
  text-align: left; background: none; border: none; padding: 9px 12px; border-radius: 8px;
  font-size: 14px; cursor: pointer; color: var(--muted);
}
.ad-tab.on { background: var(--bg-soft); color: var(--ink); font-weight: 600; }
.ad-panel { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 24px; }
.ad-panel h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: -.01em; }
.ad-hint { font-size: 13px; color: var(--muted); margin: 0 0 20px; }
.ad-field { margin-bottom: 16px; }
.ad-field label { display: block; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 6px; }
.ad-input, .ad-textarea {
  width: 100%; border: 1px solid var(--line); border-radius: 8px; background: var(--bg);
  color: var(--ink); padding: 9px 11px; font-size: 14px; font-family: inherit;
}
.ad-textarea { min-height: 110px; resize: vertical; line-height: 1.5; }
.ad-input:focus, .ad-textarea:focus { outline: 2px solid var(--ink); outline-offset: 1px; }
.ad-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.ad-card { border: 1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 14px; background: var(--bg); }
.ad-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 8px; }
.ad-card-head strong { font-size: 14px; }
.ad-btn {
  border: 1px solid var(--line); background: var(--card); color: var(--ink);
  border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer;
}
.ad-btn:hover { background: var(--bg-soft); }
.ad-btn.primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
.ad-btn.danger { color: var(--ko); border-color: color-mix(in srgb, var(--ko) 40%, var(--line)); }
.ad-btn.sm { padding: 5px 10px; font-size: 12px; }
.ad-imgfield { display: flex; gap: 12px; align-items: flex-start; }
.ad-imgprev { width: 88px; height: 66px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); background: var(--bg-soft); flex-shrink: 0; }
.ad-imgprev.ph { display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--muted); }
.ad-switch { display: flex; gap: 8px; }
.ad-switch button {
  flex: 1; padding: 12px; border-radius: 10px; border: 1px solid var(--line);
  background: var(--card); cursor: pointer; font-size: 14px; font-weight: 600; color: var(--muted);
}
.ad-switch button.on-ok { background: var(--ok-soft); color: var(--ok); border-color: var(--ok); }
.ad-switch button.on-ko { background: var(--ko-soft); color: var(--ko); border-color: var(--ko); }
.ad-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: var(--ink); color: var(--bg); padding: 10px 18px; border-radius: 999px;
  font-size: 14px; font-weight: 600; z-index: 100; box-shadow: 0 6px 24px rgba(0,0,0,.2);
}

/* Login */
.lg-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--bg); }
.lg-card { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 32px; }
.lg-card h1 { font-size: 20px; margin: 0 0 6px; letter-spacing: -.02em; }
.lg-card p { font-size: 13px; color: var(--muted); margin: 0 0 22px; }
.lg-err { background: var(--ko-soft); color: var(--ko); font-size: 13px; padding: 9px 12px; border-radius: 8px; margin-bottom: 14px; }

@media (max-width: 820px) {
  .pf-project { grid-template-columns: 1fr; gap: 24px; }
  .pf-project-img, .pf-project-imgph { min-height: 240px; aspect-ratio: 4/3; height: auto; }
  .pf-job { grid-template-columns: 1fr; gap: 10px; }
  .pf-job-logo, .pf-job-logoph { order: -1; }
  .ad-body { grid-template-columns: 1fr; }
  .ad-tabs { flex-direction: row; overflow-x: auto; position: static; }
  .pf-nav { display: none; }
  .ad-row { grid-template-columns: 1fr; }
}
`;

/* ============================================================ */

function AvailabilityPill({ settings }) {
  const ok = settings.available;
  return (
    <span className={`pf-pill ${ok ? "ok" : "ko"}`}>
      <span className="pf-dot" />
      {ok ? settings.availableLabel : settings.unavailableLabel}
    </span>
  );
}

/* ---------- Site public ---------- */
function PublicSite({ data, theme, setTheme, openAdmin, previewBanner, onExitPreview, onOpenProject }) {
  const { settings, clients, projects, about, background, contact } = data;
  const scrollTo = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div>
      {previewBanner && (
        <div style={{
          background: "var(--ink)", color: "var(--bg)", fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "8px 16px",
        }}>
          <span>Prévisualisation du brouillon — non publié</span>
          <button className="ad-btn sm" style={{ background: "var(--bg)", color: "var(--ink)" }} onClick={onExitPreview}>
            Retour à l'admin
          </button>
        </div>
      )}
      <header className="pf-header">
        <div className="pf-container pf-header-in">
          <button className="pf-logo" onClick={scrollTo("top")}>{settings.initials}</button>
          <nav className="pf-nav">
            <a href="#work" onClick={scrollTo("work")}>Projets</a>
            <a href="#about" onClick={scrollTo("about")}>À propos</a>
            <a href="#background" onClick={scrollTo("background")}>Parcours</a>
            <a href="#contact" onClick={scrollTo("contact")}>Contact</a>
          </nav>
          <div className="pf-header-right">
            <AvailabilityPill settings={settings} />
            <button className="pf-theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? "Sombre" : "Clair"}
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="pf-hero pf-container">
          <div className="pf-hero-name">{settings.name}</div>
          {settings.portrait ? (
            <img className="pf-hero-portrait" src={settings.portrait} alt={`Portrait de ${settings.name}`} />
          ) : null}
          <h1>
            {settings.heroLine1} {settings.heroLine2}
          </h1>
          <div className="pf-hero-meta">
            <span>{settings.metaLine}</span>
            <AvailabilityPill settings={settings} />
          </div>
        </section>

        {/* CLIENTS */}
        {clients.length > 0 && (
          <section className="pf-clients">
            <div className="pf-container pf-clients-grid">
              {clients.map((c) => (
                <div className="pf-client" key={c.id} title={c.name}>
                  {c.image ? <img src={c.image} alt={c.name} /> : <span>{c.name}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* WORK */}
        <section className="pf-section" id="work">
          <div className="pf-container">
            <div className="pf-eyebrow">Projets sélectionnés</div>
            {projects.map((p) => {
              const clickable = p.linkType === "internal" || (p.linkType === "external" && p.externalUrl);
              const open = () => {
                if (p.linkType === "external" && p.externalUrl) {
                  window.open(p.externalUrl, "_blank", "noopener");
                } else if (p.linkType === "internal") {
                  onOpenProject && onOpenProject(p.id);
                }
              };
              const extLinks = (p.links || []).filter((l) => l.url);
              return (
                <article className={`pf-project ${clickable ? "pf-project-clickable" : ""}`} key={p.id}
                  onClick={clickable ? open : undefined}
                  role={clickable ? "link" : undefined} tabIndex={clickable ? 0 : undefined}
                  onKeyDown={clickable ? (e) => { if (e.key === "Enter") open(); } : undefined}>
                  <div className="pf-project-content">
                    <h3>{p.title}{clickable ? " →" : ""}</h3>
                    <p>{p.description}</p>
                    <dl className="pf-meta">
                      {p.years && (
                        <div className="pf-meta-row"><dt>Années</dt><dd>{p.years}</dd></div>
                      )}
                      {p.role && (
                        <div className="pf-meta-row"><dt>Rôle</dt><dd>{p.role}</dd></div>
                      )}
                      {p.scope && (
                        <div className="pf-meta-row"><dt>Périmètre</dt><dd>{p.scope}</dd></div>
                      )}
                      {extLinks.length > 0 && (
                        <div className="pf-meta-row">
                          <dt>Liens</dt>
                          <dd>
                            {extLinks.map((l, i) => (
                              <span key={l.id}>{i > 0 && " · "}
                                <a href={l.url} target="_blank" rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}>{l.label || "Lien"} ↗</a>
                              </span>
                            ))}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                  <div className="pf-project-visual">
                    {p.image ? (
                      <img className="pf-project-img" src={p.image} alt={`Aperçu du projet ${p.title}`} />
                    ) : (
                      <div className="pf-project-imgph">Visuel du projet</div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ABOUT */}
        <section className="pf-section pf-about" id="about">
          <div className="pf-container">
            <div className="pf-eyebrow">{about.title || "Ma façon de travailler"}</div>
            {(about.text || "").split(/\n\n+/).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </section>

        {/* BACKGROUND */}
        <section className="pf-section" id="background">
          <div className="pf-container">
            <div className="pf-eyebrow">Parcours</div>
            {background.map((j) => (
              <article className="pf-job" key={j.id}>
                <div className="pf-job-dates">{j.dates}</div>
                {j.logo ? (
                  <img className="pf-job-logo" src={j.logo} alt="" />
                ) : (
                  <div className="pf-job-logoph">Logo</div>
                )}
                <div>
                  <h3>{j.title}</h3>
                  <p>{j.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* CONTACT */}
        <section className="pf-section pf-contact" id="contact">
          <div className="pf-container">
            <h2>{contact.heading}</h2>
            <AvailabilityPill settings={settings} />
            <div className="pf-contact-note" style={{ marginTop: 14 }}>{contact.note}</div>
            <div className="pf-contact-note">{contact.terms}</div>
            <div className="pf-contact-row">
              {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
              {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a>}
              {contact.links.filter(l => l.url).map((l) => (
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="pf-footer pf-container">
        <span>© {new Date().getFullYear()} {settings.name}</span>
        <button onClick={openAdmin}>Admin</button>
      </footer>
    </div>
  );
}

/* ---------- Page projet interne ---------- */
function ProjectPage({ project, data, theme, setTheme, onBack }) {
  const { settings, contact } = data;
  const page = project.page || {};
  const sections = page.sections || [];
  const credits = (page.credits || []).filter((c) => c.label || c.value);
  const anchorId = (sec, i) => `sec-${i}-${(sec.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [project.id]);

  const scrollToAnchor = (id) => (e) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div>
      <header className="pf-header">
        <div className="pf-container pf-header-in">
          <button className="pf-logo" onClick={() => onBack()}>{settings.initials}</button>
          <nav className="pf-nav">
            <a href="#" onClick={(e) => { e.preventDefault(); onBack("work"); }}>Projets</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onBack("about"); }}>À propos</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onBack("background"); }}>Parcours</a>
            <a href="#" onClick={(e) => { e.preventDefault(); onBack("contact"); }}>Contact</a>
          </nav>
          <div className="pf-header-right">
            <AvailabilityPill settings={settings} />
            <button className="pf-theme" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
              {theme === "light" ? "Sombre" : "Clair"}
            </button>
          </div>
        </div>
      </header>

      <main className="pf-container">
        <button className="pp-back" onClick={() => onBack("work")}>← Retour aux projets</button>
        <h1 className="pp-title">{project.title}</h1>

        <dl className="pp-metagrid">
          {project.peoples && (<div><dt>Équipe</dt><dd>{project.peoples}</dd></div>)}
          {project.years && (<div><dt>Années</dt><dd>{project.years}</dd></div>)}
          {project.role && (<div><dt>Rôle</dt><dd>{project.role}</dd></div>)}
          {project.scope && (<div><dt>Périmètre</dt><dd>{project.scope}</dd></div>)}
        </dl>

        {project.image && (
          <img className="pp-hero-img" src={project.image} alt={`Aperçu du projet ${project.title}`} />
        )}

        {sections.length > 1 && (
          <nav className="pp-toc">
            <div className="pp-toc-label">Sommaire</div>
            <div className="pp-toc-list">
              {sections.map((sec, i) => (
                <a key={sec.id} href={`#${anchorId(sec, i)}`} onClick={scrollToAnchor(anchorId(sec, i))}>
                  {sec.title || `Section ${i + 1}`}
                </a>
              ))}
            </div>
          </nav>
        )}

        <article className="pp-article">
          {page.heading && <h2>{page.heading}</h2>}
          {page.tldr && (
            <div className="pp-tldr">
              <div className="pp-tldr-label">{page.tldrTitle || "En bref"}</div>
              <p>{page.tldr}</p>
            </div>
          )}
          {sections.map((sec, i) => (
            <section className="pp-section" id={anchorId(sec, i)} key={sec.id}>
              {sec.title && <h3>{sec.title}</h3>}
              {(sec.text || "").split(/\n\n+/).filter(Boolean).map((para, j) => (
                <p key={j}>{para}</p>
              ))}
              {sec.image && <img src={sec.image} alt="" />}
            </section>
          ))}
          {credits.length > 0 && (
            <div className="pp-credits">
              {credits.map((c) => (
                <div key={c.id}><span>{c.label}</span>{c.value}</div>
              ))}
            </div>
          )}
        </article>

        <section className="pf-section pf-contact" style={{ borderBottom: "none" }}>
          <h2>{contact.heading}</h2>
          <AvailabilityPill settings={settings} />
          <div className="pf-contact-note" style={{ marginTop: 14 }}>{contact.note}</div>
          <div className="pf-contact-note">{contact.terms}</div>
          <div className="pf-contact-row">
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
            {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`}>{contact.phone}</a>}
            {contact.links.filter((l) => l.url).map((l) => (
              <a key={l.id} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
            ))}
          </div>
        </section>
      </main>

      <footer className="pf-footer pf-container">
        <span>© {new Date().getFullYear()} {settings.name}</span>
        <button onClick={() => onBack("work")}>← Retour aux projets</button>
      </footer>
    </div>
  );
}

/* ---------- Login ---------- */
function Login({ onSuccess, onBack }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (busy) return;
    setErr("");
    if (supabase) {
      // Authentification réelle via Supabase Auth
      setBusy(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        });
        if (error) {
          console.error("[Portfolio] Erreur Supabase Auth :", error);
          const msg = (error.message || "").toLowerCase();
          if (msg.includes("invalid login credentials")) {
            setErr("Email ou mot de passe incorrect pour ce projet Supabase.");
          } else if (msg.includes("email not confirmed")) {
            setErr("Email non confirmé : dans Supabase, recréez l'utilisateur en cochant « Auto Confirm User ».");
          } else if (msg.includes("rate limit") || msg.includes("too many")) {
            setErr("Trop de tentatives : patientez une minute puis réessayez.");
          } else {
            setErr(`Erreur Supabase : ${error.message}`);
          }
        } else {
          onSuccess();
        }
      } catch (e) {
        console.error("[Portfolio] Connexion Supabase impossible :", e);
        setErr("Connexion impossible. Vérifiez votre réseau.");
      } finally {
        setBusy(false);
      }
      return;
    }
    // Mode sans base de données : vérification locale
    if (email.trim().toLowerCase() === ADMIN_EMAIL && pass === ADMIN_PASS) {
      onSuccess();
    } else {
      setErr("Identifiants incorrects.");
    }
  };
  return (
    <div className="lg-wrap">
      <div className="lg-card">
        <h1>Administration</h1>
        <p>Connectez-vous pour modifier le contenu du portfolio.</p>
        {err && <div className="lg-err">{err}</div>}
        <div className="ad-field">
          <label>Email</label>
          <input className="ad-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
        </div>
        <div className="ad-field">
          <label>Mot de passe</label>
          <input className="ad-input" type="password" value={pass} onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button className="ad-btn primary" style={{ flex: 1 }} onClick={submit} disabled={busy}>
            {busy ? "Connexion…" : "Se connecter"}
          </button>
          <button className="ad-btn" onClick={onBack}>Retour au site</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Champs réutilisables ---------- */
function Field({ label, value, onChange, textarea, type = "text", placeholder }) {
  return (
    <div className="ad-field">
      <label>{label}</label>
      {textarea ? (
        <textarea className="ad-textarea" value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input className="ad-input" type={type} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function ImageField({ label, value, onChange, maxDim = 1400, mime = "image/jpeg", hint }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const handleFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const dataUrl = await fileToResizedDataUrl(file, maxDim, mime, 0.82);
      onChange(dataUrl);
    } catch (err) {
      setError("Impossible de charger cette image. Vérifiez le format du fichier.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };
  return (
    <div className="ad-field">
      <label>{label}</label>
      <div className="ad-imgfield">
        {value ? (
          <img className="ad-imgprev" src={value} alt="" />
        ) : (
          <div className="ad-imgprev ph">Aucune image</div>
        )}
        <div style={{ flex: 1 }}>
          <input
            className="ad-input"
            placeholder="URL de l'image (https://…)"
            value={value && value.startsWith("data:") ? "" : value || ""}
            onChange={(e) => onChange(e.target.value)}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="ad-btn sm" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}>
              {busy ? "Chargement…" : "Importer un fichier"}
            </button>
            {value && (
              <button className="ad-btn sm danger" onClick={() => onChange("")}>Supprimer</button>
            )}
          </div>
          {error && <div style={{ fontSize: 12, color: "var(--ko)", marginTop: 6, fontWeight: 600 }}>{error}</div>}
          {hint && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{hint}</div>}
          <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin ---------- */
const TABS = [
  ["general", "Général & Hero"],
  ["availability", "Disponibilité"],
  ["clients", "Logos clients"],
  ["projects", "Projets"],
  ["about", "Ma façon de travailler"],
  ["background", "Background / CV"],
  ["contact", "Contact"],
];

function Admin({ data, setData, onSaveDraft, onPublish, onExport, onExportJson, onLogout, onPreviewDraft, onViewSite, saving, publishing, dirty, publishedAt }) {
  const [tab, setTab] = useState("general");
  const [pageEditor, setPageEditor] = useState(null); // id du projet dont la page interne est en édition
  const [confirmDelete, setConfirmDelete] = useState(null); // id de l'élément en attente de confirmation

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(null), 3500);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  // Premier clic : demande confirmation ; second clic : supprime.
  const askDelete = (id, doRemove) => {
    if (confirmDelete === id) {
      setConfirmDelete(null);
      doRemove();
    } else {
      setConfirmDelete(id);
    }
  };

  /* --- Import de CV --- */
  const cvFileRef = useRef(null);
  const [cvImport, setCvImport] = useState({ status: "idle", items: [], error: "" });

  const handleCvFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (cvFileRef.current) cvFileRef.current.value = "";
    if (!file) return;
    if (file.size > 3.5 * 1024 * 1024) {
      setCvImport({ status: "error", items: [], error: "PDF trop volumineux (3,5 Mo maximum). Compressez-le ou exportez-le en qualite reduite." });
      return;
    }
    if (file.type !== "application/pdf") {
      setCvImport({ status: "error", items: [], error: "Le fichier doit \u00eatre un PDF." });
      return;
    }
    setCvImport({ status: "loading", items: [], error: "" });
    try {
      const base64 = await fileToBase64(file);
      const items = await extractCvFromPdf(base64);
      setCvImport({ status: "ready", items, error: "" });
    } catch (err) {
      setCvImport({
        status: "error",
        items: [],
        error: err && err.message ? err.message : "Impossible d'analyser ce CV.",
      });
    }
  };

  const applyCvImport = (mode) => {
    setData((d) => ({
      ...d,
      background: mode === "replace" ? cvImport.items : [...d.background, ...cvImport.items],
    }));
    setCvImport({ status: "idle", items: [], error: "" });
  };

  const patch = (path, value) => {
    setData((d) => {
      const next = JSON.parse(JSON.stringify(d));
      let obj = next;
      for (let i = 0; i < path.length - 1; i++) obj = obj[path[i]];
      obj[path[path.length - 1]] = value;
      return next;
    });
  };

  const listOps = (key) => ({
    update: (id, field, value) =>
      setData((d) => ({ ...d, [key]: d[key].map((it) => (it.id === id ? { ...it, [field]: value } : it)) })),
    remove: (id) => setData((d) => ({ ...d, [key]: d[key].filter((it) => it.id !== id) })),
    move: (id, dir) =>
      setData((d) => {
        const arr = [...d[key]];
        const i = arr.findIndex((it) => it.id === id);
        const j = i + dir;
        if (j < 0 || j >= arr.length) return d;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...d, [key]: arr };
      }),
    add: (item) => setData((d) => ({ ...d, [key]: [...d[key], { id: uid(), ...item }] })),
  });

  const clients = listOps("clients");
  const projects = listOps("projects");
  const jobs = listOps("background");

  const patchProject = (pid, updater) =>
    setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === pid ? updater(p) : p)) }));

  const pageOps = {
    setField: (pid, field, value) => patchProject(pid, (p) => ({ ...p, page: { ...p.page, [field]: value } })),
    addSection: (pid) =>
      patchProject(pid, (p) => ({
        ...p,
        page: { ...p.page, sections: [...(p.page.sections || []), { id: uid(), title: "", text: "", image: "" }] },
      })),
    updateSection: (pid, sid, field, value) =>
      patchProject(pid, (p) => ({
        ...p,
        page: { ...p.page, sections: p.page.sections.map((s2) => (s2.id === sid ? { ...s2, [field]: value } : s2)) },
      })),
    removeSection: (pid, sid) =>
      patchProject(pid, (p) => ({ ...p, page: { ...p.page, sections: p.page.sections.filter((s2) => s2.id !== sid) } })),
    moveSection: (pid, sid, dir) =>
      patchProject(pid, (p) => {
        const arr = [...p.page.sections];
        const i = arr.findIndex((s2) => s2.id === sid);
        const j = i + dir;
        if (j < 0 || j >= arr.length) return p;
        [arr[i], arr[j]] = [arr[j], arr[i]];
        return { ...p, page: { ...p.page, sections: arr } };
      }),
    addCredit: (pid) =>
      patchProject(pid, (p) => ({
        ...p,
        page: { ...p.page, credits: [...(p.page.credits || []), { id: uid(), label: "", value: "" }] },
      })),
    updateCredit: (pid, cid, field, value) =>
      patchProject(pid, (p) => ({
        ...p,
        page: { ...p.page, credits: p.page.credits.map((c) => (c.id === cid ? { ...c, [field]: value } : c)) },
      })),
    removeCredit: (pid, cid) =>
      patchProject(pid, (p) => ({ ...p, page: { ...p.page, credits: p.page.credits.filter((c) => c.id !== cid) } })),
  };

  const projectLinkOps = {
    update: (pid, lid, field, value) =>
      setData((d) => ({
        ...d,
        projects: d.projects.map((p) =>
          p.id === pid ? { ...p, links: p.links.map((l) => (l.id === lid ? { ...l, [field]: value } : l)) } : p
        ),
      })),
    add: (pid) =>
      setData((d) => ({
        ...d,
        projects: d.projects.map((p) =>
          p.id === pid ? { ...p, links: [...(p.links || []), { id: uid(), label: "", url: "" }] } : p
        ),
      })),
    remove: (pid, lid) =>
      setData((d) => ({
        ...d,
        projects: d.projects.map((p) => (p.id === pid ? { ...p, links: p.links.filter((l) => l.id !== lid) } : p)),
      })),
  };

  const contactLinkOps = {
    update: (lid, field, value) =>
      setData((d) => ({
        ...d,
        contact: { ...d.contact, links: d.contact.links.map((l) => (l.id === lid ? { ...l, [field]: value } : l)) },
      })),
    add: () =>
      setData((d) => ({ ...d, contact: { ...d.contact, links: [...d.contact.links, { id: uid(), label: "", url: "" }] } })),
    remove: (lid) =>
      setData((d) => ({ ...d, contact: { ...d.contact, links: d.contact.links.filter((l) => l.id !== lid) } })),
  };

  const s = data.settings;

  return (
    <div className="ad-wrap">
      <div className="pf-container">
        <div className="ad-topbar">
          <h1>Administration du portfolio</h1>
          <div className="sp">
            <button className="ad-btn" onClick={onViewSite}>Site publié</button>
            <button className="ad-btn" onClick={onPreviewDraft}>Prévisualiser</button>
            <button className="ad-btn" onClick={onExport}>Exporter HTML</button>
            <button className="ad-btn" onClick={onExportJson}>Exporter les données (JSON)</button>
            <button className="ad-btn" onClick={onSaveDraft} disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer le brouillon"}
            </button>
            <button className="ad-btn primary" onClick={onPublish} disabled={publishing}>
              {publishing ? "Publication…" : SUPABASE_ENABLED ? "Publier" : "Publier (data.json)"}
            </button>
            <button className="ad-btn" onClick={onLogout}>Déconnexion</button>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0 0", fontSize: 13, color: "var(--muted)" }}>
          {publishedAt ? (
            <span>Dernière publication : {new Date(publishedAt).toLocaleString("fr-FR")}</span>
          ) : (
            <span>Le site n'a jamais été publié.</span>
          )}
          {dirty && (
            <span style={{
              background: "var(--ko-soft)", color: "var(--ko)", fontWeight: 600,
              padding: "3px 10px", borderRadius: 999,
            }}>
              Modifications non publiées
            </span>
          )}
        </div>

        <div className="ad-body">
          <div className="ad-tabs">
            {TABS.map(([id, label]) => (
              <button key={id} className={`ad-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>

          <div className="ad-panel">
            {tab === "general" && (
              <div>
                <h2>Général & Hero</h2>
                <p className="ad-hint">Identité du designer et grande phrase d'accroche de la page d'accueil.</p>
                <div className="ad-row">
                  <Field label="Nom complet" value={s.name} onChange={(v) => patch(["settings", "name"], v)} />
                  <Field label="Initiales (logo header)" value={s.initials} onChange={(v) => patch(["settings", "initials"], v)} />
                </div>
                <Field label="Phrase d'accroche — 1ère partie" value={s.heroLine1} onChange={(v) => patch(["settings", "heroLine1"], v)} />
                <Field label="Phrase d'accroche — 2ème partie" value={s.heroLine2} onChange={(v) => patch(["settings", "heroLine2"], v)} />
                <ImageField label="Portrait (affiché au-dessus du titre)" value={s.portrait}
                  onChange={(v) => patch(["settings", "portrait"], v)} maxDim={600}
                  hint="Photo carrée ou paysage recommandée, elle sera affichée en pastille arrondie au-dessus de l'accroche." />
                <Field label="Ligne de métadonnées (sous le titre)" value={s.metaLine} onChange={(v) => patch(["settings", "metaLine"], v)} />
              </div>
            )}

            {tab === "availability" && (
              <div>
                <h2>Disponibilité</h2>
                <p className="ad-hint">Statut affiché dans le header, le hero et la section contact.</p>
                <div className="ad-switch" style={{ marginBottom: 20 }}>
                  <button className={s.available ? "on-ok" : ""} onClick={() => patch(["settings", "available"], true)}>
                    ● Disponible
                  </button>
                  <button className={!s.available ? "on-ko" : ""} onClick={() => patch(["settings", "available"], false)}>
                    ● Indisponible
                  </button>
                </div>
                <div className="ad-row">
                  <Field label="Libellé si disponible" value={s.availableLabel} onChange={(v) => patch(["settings", "availableLabel"], v)} />
                  <Field label="Libellé si indisponible" value={s.unavailableLabel} onChange={(v) => patch(["settings", "unavailableLabel"], v)} />
                </div>
              </div>
            )}

            {tab === "clients" && (
              <div>
                <h2>Logos clients</h2>
                <p className="ad-hint">Bandeau de logos affiché sous le hero. Sans image, le nom du client est affiché en texte.</p>
                {data.clients.map((c, i) => (
                  <div className="ad-card" key={c.id}>
                    <div className="ad-card-head">
                      <strong>Client {i + 1}</strong>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="ad-btn sm" onClick={() => clients.move(c.id, -1)}>↑</button>
                        <button className="ad-btn sm" onClick={() => clients.move(c.id, 1)}>↓</button>
                        <button className="ad-btn sm danger" onClick={() => clients.remove(c.id)}>Supprimer</button>
                      </div>
                    </div>
                    <Field label="Nom" value={c.name} onChange={(v) => clients.update(c.id, "name", v)} />
                    <ImageField label="Logo" value={c.image} onChange={(v) => clients.update(c.id, "image", v)}
                      maxDim={320} mime="image/png" hint="PNG avec fond transparent recommandé." />
                  </div>
                ))}
                <button className="ad-btn" onClick={() => clients.add({ name: "Nouveau client", image: "" })}>+ Ajouter un client</button>
              </div>
            )}

            {tab === "projects" && (
              <div>
                <h2>Projets ({data.projects.length})</h2>
                <p className="ad-hint">Section "Projets sélectionnés". Ajoutez autant de projets que nécessaire.</p>
                {data.projects.map((p, i) => (
                  <div className="ad-card" key={p.id}>
                    <div className="ad-card-head">
                      <strong>Projet {i + 1} — {p.title || "Sans titre"}</strong>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="ad-btn sm" onClick={() => projects.move(p.id, -1)}>↑</button>
                        <button className="ad-btn sm" onClick={() => projects.move(p.id, 1)}>↓</button>
                        <button className="ad-btn sm danger" onClick={() => askDelete(p.id, () => projects.remove(p.id))}>
                          {confirmDelete === p.id ? "Confirmer ?" : "Supprimer"}
                        </button>
                      </div>
                    </div>
                    <Field label="Titre" value={p.title} onChange={(v) => projects.update(p.id, "title", v)} />
                    <Field label="Description" textarea value={p.description} onChange={(v) => projects.update(p.id, "description", v)} />
                    <div className="ad-row">
                      <Field label="Années" value={p.years} onChange={(v) => projects.update(p.id, "years", v)} placeholder="2025 ou 2020 → 2022" />
                      <Field label="Rôle" value={p.role} onChange={(v) => projects.update(p.id, "role", v)} />
                    </div>
                    <Field label="Scope" value={p.scope} onChange={(v) => projects.update(p.id, "scope", v)} placeholder="UI/UX, Design system, Prototyping…" />
                    <ImageField label="Visuel du projet" value={p.image} onChange={(v) => projects.update(p.id, "image", v)}
                      hint="Format paysage 16:9 recommandé." />
                    <div className="ad-field">
                      <label>Liens</label>
                      {(p.links || []).map((l) => (
                        <div key={l.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                          <input className="ad-input" style={{ maxWidth: 160 }} placeholder="Libellé (Behance…)"
                            value={l.label} onChange={(e) => projectLinkOps.update(p.id, l.id, "label", e.target.value)} />
                          <input className="ad-input" placeholder="https://…"
                            value={l.url} onChange={(e) => projectLinkOps.update(p.id, l.id, "url", e.target.value)} />
                          <button className="ad-btn sm danger" onClick={() => projectLinkOps.remove(p.id, l.id)}>✕</button>
                        </div>
                      ))}
                      <button className="ad-btn sm" onClick={() => projectLinkOps.add(p.id)}>+ Ajouter un lien</button>
                    </div>

                    {/* --- Destination au clic --- */}
                    <div className="ad-field" style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 4 }}>
                      <label>Au clic sur le projet</label>
                      <div className="ad-switch">
                        {[["none", "Aucun lien"], ["external", "URL externe"], ["internal", "Page interne"]].map(([val, lab]) => (
                          <button key={val}
                            style={p.linkType === val ? { background: "var(--ink)", color: "var(--bg)", borderColor: "var(--ink)" } : {}}
                            onClick={() => projects.update(p.id, "linkType", val)}>
                            {lab}
                          </button>
                        ))}
                      </div>
                    </div>

                    {p.linkType === "external" && (
                      <Field label="URL externe" value={p.externalUrl}
                        onChange={(v) => projects.update(p.id, "externalUrl", v)}
                        placeholder="https://www.behance.net/…" />
                    )}

                    {p.linkType === "internal" && (
                      <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 14, background: "var(--bg-soft)" }}>
                        <button className="ad-btn sm" style={{ marginBottom: pageEditor === p.id ? 14 : 0 }}
                          onClick={() => setPageEditor(pageEditor === p.id ? null : p.id)}>
                          {pageEditor === p.id ? "▾ Masquer l'édition de la page interne" : "▸ Éditer la page interne (étude de cas)"}
                        </button>
                        {pageEditor === p.id && (
                          <div>
                            <Field label="Équipe (affichée en meta de la page interne)" value={p.peoples}
                              onChange={(v) => projects.update(p.id, "peoples", v)}
                              placeholder="Prénom Nom, Prénom Nom…" />
                            <Field label="Titre éditorial (H2 de l'article)" value={p.page.heading}
                              onChange={(v) => pageOps.setField(p.id, "heading", v)} />
                            <div className="ad-row">
                              <Field label="Libellé du résumé" value={p.page.tldrTitle}
                                onChange={(v) => pageOps.setField(p.id, "tldrTitle", v)} placeholder="En bref" />
                            </div>
                            <Field label="Résumé (encadré en tête d'article)" textarea value={p.page.tldr}
                              onChange={(v) => pageOps.setField(p.id, "tldr", v)} />

                            <div className="ad-field">
                              <label>Sections de l'article ({(p.page.sections || []).length}) — le sommaire est généré automatiquement</label>
                              {(p.page.sections || []).map((sec, si) => (
                                <div className="ad-card" key={sec.id} style={{ background: "var(--card)" }}>
                                  <div className="ad-card-head">
                                    <strong>Section {si + 1} — {sec.title || "Sans titre"}</strong>
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button className="ad-btn sm" onClick={() => pageOps.moveSection(p.id, sec.id, -1)}>↑</button>
                                      <button className="ad-btn sm" onClick={() => pageOps.moveSection(p.id, sec.id, 1)}>↓</button>
                                      <button className="ad-btn sm danger" onClick={() => pageOps.removeSection(p.id, sec.id)}>Supprimer</button>
                                    </div>
                                  </div>
                                  <Field label="Titre de section" value={sec.title}
                                    onChange={(v) => pageOps.updateSection(p.id, sec.id, "title", v)}
                                    placeholder="Introduction, Goals, Approach…" />
                                  <Field label="Texte (paragraphes séparés par une ligne vide)" textarea value={sec.text}
                                    onChange={(v) => pageOps.updateSection(p.id, sec.id, "text", v)} />
                                  <ImageField label="Image de section (optionnelle)" value={sec.image}
                                    onChange={(v) => pageOps.updateSection(p.id, sec.id, "image", v)} />
                                </div>
                              ))}
                              <button className="ad-btn sm" onClick={() => pageOps.addSection(p.id)}>+ Ajouter une section</button>
                            </div>

                            <div className="ad-field">
                              <label>Crédits (fin d'article)</label>
                              {(p.page.credits || []).map((c) => (
                                <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                                  <input className="ad-input" style={{ maxWidth: 180 }} placeholder="Rôle (Product Designer…)"
                                    value={c.label} onChange={(e) => pageOps.updateCredit(p.id, c.id, "label", e.target.value)} />
                                  <input className="ad-input" placeholder="Nom"
                                    value={c.value} onChange={(e) => pageOps.updateCredit(p.id, c.id, "value", e.target.value)} />
                                  <button className="ad-btn sm danger" onClick={() => pageOps.removeCredit(p.id, c.id)}>✕</button>
                                </div>
                              ))}
                              <button className="ad-btn sm" onClick={() => pageOps.addCredit(p.id)}>+ Ajouter un crédit</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <button className="ad-btn" onClick={() => projects.add({
                  title: "Nouveau projet", description: "", years: "", role: "", scope: "", image: "",
                  peoples: "", linkType: "none", externalUrl: "",
                  links: [{ id: uid(), label: "", url: "" }],
                  page: { heading: "", tldrTitle: "En bref", tldr: "", sections: [], credits: [] },
                })}>+ Ajouter un projet</button>
              </div>
            )}

            {tab === "about" && (
              <div>
                <h2>Ma façon de travailler</h2>
                <p className="ad-hint">Texte de présentation de la méthode de travail. Séparez les paragraphes par une ligne vide.</p>
                <Field label="Titre de section" value={data.about.title} onChange={(v) => patch(["about", "title"], v)} />
                <Field label="Texte" textarea value={data.about.text} onChange={(v) => patch(["about", "text"], v)} />
              </div>
            )}

            {tab === "background" && (
              <div>
                <h2>Background / CV ({data.background.length})</h2>
                <p className="ad-hint">Parcours professionnel. Ajoutez, modifiez ou supprimez des expériences — ou importez un CV en PDF pour tout remplir automatiquement.</p>

                {/* --- Import de CV (PDF) --- */}
                <div className="ad-card" style={{ borderStyle: "dashed" }}>
                  <div className="ad-card-head">
                    <strong>Importer un CV (PDF)</strong>
                    {cvImport.status === "idle" && (
                      <button className="ad-btn sm" onClick={() => cvFileRef.current && cvFileRef.current.click()}>
                        Choisir un fichier PDF
                      </button>
                    )}
                  </div>
                  <input ref={cvFileRef} type="file" accept="application/pdf" style={{ display: "none" }} onChange={handleCvFile} />

                  {cvImport.status === "idle" && (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      Le CV est analysé par Claude : les expériences détectées viendront remplir les sections du parcours, que vous pourrez ensuite ajuster à la main.
                    </div>
                  )}
                  {cvImport.status === "loading" && (
                    <div style={{ fontSize: 13, color: "var(--muted)" }}>
                      Analyse du CV en cours… (quelques secondes)
                    </div>
                  )}
                  {cvImport.status === "error" && (
                    <div>
                      <div style={{ fontSize: 13, color: "var(--ko)", fontWeight: 600, marginBottom: 10 }}>{cvImport.error}</div>
                      <button className="ad-btn sm" onClick={() => cvFileRef.current && cvFileRef.current.click()}>Réessayer</button>
                    </div>
                  )}
                  {cvImport.status === "ready" && (
                    <div>
                      <div style={{ fontSize: 13, marginBottom: 10 }}>
                        <strong>{cvImport.items.length} expérience{cvImport.items.length > 1 ? "s" : ""} détectée{cvImport.items.length > 1 ? "s" : ""} :</strong>
                        <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "var(--muted)", lineHeight: 1.6 }}>
                          {cvImport.items.map((it) => (
                            <li key={it.id}>{it.dates ? `${it.dates} — ` : ""}{it.title || "Sans titre"}</li>
                          ))}
                        </ul>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="ad-btn sm primary" onClick={() => applyCvImport("replace")}>
                          Remplacer le parcours actuel
                        </button>
                        <button className="ad-btn sm" onClick={() => applyCvImport("append")}>
                          Ajouter à la suite
                        </button>
                        <button className="ad-btn sm danger" onClick={() => setCvImport({ status: "idle", items: [], error: "" })}>
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {data.background.map((j, i) => (
                  <div className="ad-card" key={j.id}>
                    <div className="ad-card-head">
                      <strong>Expérience {i + 1} — {j.title || "Sans titre"}</strong>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="ad-btn sm" onClick={() => jobs.move(j.id, -1)}>↑</button>
                        <button className="ad-btn sm" onClick={() => jobs.move(j.id, 1)}>↓</button>
                        <button className="ad-btn sm danger" onClick={() => askDelete(j.id, () => jobs.remove(j.id))}>
                          {confirmDelete === j.id ? "Confirmer ?" : "Supprimer"}
                        </button>
                      </div>
                    </div>
                    <div className="ad-row">
                      <Field label="Dates" value={j.dates} onChange={(v) => jobs.update(j.id, "dates", v)} placeholder="2022 → Aujourd'hui" />
                      <Field label="Intitulé" value={j.title} onChange={(v) => jobs.update(j.id, "title", v)} placeholder="Product Designer — Entreprise" />
                    </div>
                    <Field label="Description" textarea value={j.description} onChange={(v) => jobs.update(j.id, "description", v)} />
                    <ImageField label="Logo entreprise" value={j.logo} onChange={(v) => jobs.update(j.id, "logo", v)}
                      maxDim={240} mime="image/png" />
                  </div>
                ))}
                <button className="ad-btn" onClick={() => jobs.add({ dates: "", title: "", description: "", logo: "" })}>
                  + Ajouter une expérience
                </button>
              </div>
            )}

            {tab === "contact" && (
              <div>
                <h2>Contact</h2>
                <p className="ad-hint">Coordonnées et liens affichés dans la section contact.</p>
                <Field label="Titre de section" value={data.contact.heading} onChange={(v) => patch(["contact", "heading"], v)} />
                <Field label="Note de disponibilité" value={data.contact.note} onChange={(v) => patch(["contact", "note"], v)} />
                <Field label="Modalités" value={data.contact.terms} onChange={(v) => patch(["contact", "terms"], v)} placeholder="Freelance / CDI · Paris / Remote" />
                <div className="ad-row">
                  <Field label="Email" type="email" value={data.contact.email} onChange={(v) => patch(["contact", "email"], v)} />
                  <Field label="Téléphone" value={data.contact.phone} onChange={(v) => patch(["contact", "phone"], v)} />
                </div>
                <div className="ad-field">
                  <label>Liens (LinkedIn, Calendly, Malt…)</label>
                  {data.contact.links.map((l) => (
                    <div key={l.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input className="ad-input" style={{ maxWidth: 160 }} placeholder="Libellé"
                        value={l.label} onChange={(e) => contactLinkOps.update(l.id, "label", e.target.value)} />
                      <input className="ad-input" placeholder="https://…"
                        value={l.url} onChange={(e) => contactLinkOps.update(l.id, "url", e.target.value)} />
                      <button className="ad-btn sm danger" onClick={() => contactLinkOps.remove(l.id)}>✕</button>
                    </div>
                  ))}
                  <button className="ad-btn sm" onClick={contactLinkOps.add}>+ Ajouter un lien</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- App ---------- */
export default function PortfolioApp() {
  const [draft, setDraft] = useState(null);
  const [published, setPublished] = useState(null); // { data, publishedAt } | null
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("site"); // site | login | admin | preview
  const [authed, setAuthed] = useState(false);
  // Thème initialisé depuis l'URL (?theme=dark ou ?theme=light) pour que
  // le lien partagé ouvre directement dans le bon mode.
  const [theme, setThemeState] = useState(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("theme");
      if (t === "dark" || t === "light") return t;
    } catch (e) {
      /* environnement sans URL */
    }
    return "light";
  });
  const setTheme = useCallback((t) => {
    setThemeState(t);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("theme", t);
      window.history.replaceState({}, "", url);
    } catch (e) {
      /* URL non modifiable : on garde juste l'état local */
    }
  }, []);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [toast, setToast] = useState("");
  const [projectView, setProjectView] = useState(null); // { id, from: "site" | "preview" } | null

  useEffect(() => {
    Promise.all([loadDraft(), loadPublished()]).then(([d, p]) => {
      setDraft(d);
      setPublished(p);
      setLoaded(true);
    });
    // Restaurer la session admin Supabase si elle existe (rechargement de page)
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data && data.session) setAuthed(true);
      });
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const dirty = !published || JSON.stringify(draft) !== JSON.stringify(published.data);

  const handleSaveDraft = useCallback(async () => {
    setSaving(true);
    const ok = await saveDraft(draft);
    setSaving(false);
    setToast(ok ? "Brouillon enregistré ✓ (dans ce navigateur)" : "Échec de l'enregistrement (contenu trop volumineux ?)");
    return ok;
  }, [draft]);

  const handlePublish = useCallback(async () => {
    setPublishing(true);
    await saveDraft(draft);
    const payload = await savePublished(draft);
    setPublishing(false);
    if (payload) {
      setPublished(payload);
      setToast(SUPABASE_ENABLED
        ? "Site publié ✓ — visible par tous les visiteurs"
        : "data.json téléchargé ✓ — remplacez public/data.json puis redéployez");
    } else {
      setToast(SUPABASE_ENABLED
        ? "Échec de la publication — vérifiez votre connexion admin"
        : "Échec de la publication (contenu trop volumineux ?)");
    }
  }, [draft]);

  const handleExport = useCallback(() => {
    try {
      const html = buildStaticHtml(draft);
      const slug = (draft.settings.name || "portfolio")
        .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio";
      downloadHtmlFile(html, `${slug}.html`);
      setToast("Fichier HTML exporté ✓ — prêt à héberger");
    } catch (e) {
      setToast("Échec de l'export HTML");
    }
  }, [draft]);

  const handleExportJson = useCallback(() => {
    try {
      const payload = { data: draft, publishedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "portfolio-data.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setToast("Données exportées ✓ — envoyez ce fichier à Claude pour l'intégrer");
    } catch (e) {
      setToast("Échec de l'export des données");
    }
  }, [draft]);

  if (!loaded) {
    return (
      <div className="pf-root" data-theme={theme}>
        <style>{CSS}</style>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 14 }}>
          Chargement du portfolio…
        </div>
      </div>
    );
  }

  // Les visiteurs voient la version publiée ; à défaut (jamais publié), le brouillon.
  const siteData = published && published.data ? published.data : draft;

  const openProject = (from) => (id) => setProjectView({ id, from });
  const closeProject = (sectionId) => {
    const from = projectView ? projectView.from : "site";
    setProjectView(null);
    setView(from);
    if (sectionId) {
      setTimeout(() => {
        const el = document.getElementById(sectionId);
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 60);
    } else {
      setTimeout(() => window.scrollTo(0, 0), 30);
    }
  };

  const projectPageData = projectView && projectView.from === "preview" ? draft : siteData;
  const currentProject = projectView
    ? (projectPageData.projects || []).find((p) => p.id === projectView.id)
    : null;

  return (
    <div className="pf-root" data-theme={theme}>
      <style>{CSS}</style>
      {projectView && currentProject ? (
        <>
          {projectView.from === "preview" && (
            <div style={{
              background: "var(--ink)", color: "var(--bg)", fontSize: 13, fontWeight: 600,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "8px 16px",
            }}>
              <span>Prévisualisation du brouillon — non publié</span>
              <button className="ad-btn sm" style={{ background: "var(--bg)", color: "var(--ink)" }}
                onClick={() => { setProjectView(null); setView("admin"); }}>
                Retour à l'admin
              </button>
            </div>
          )}
          <ProjectPage project={currentProject} data={projectPageData}
            theme={theme} setTheme={setTheme} onBack={closeProject} />
        </>
      ) : (
        <>
          {view === "site" && (
            <PublicSite data={siteData} theme={theme} setTheme={setTheme}
              onOpenProject={openProject("site")}
              openAdmin={() => setView(authed ? "admin" : "login")} />
          )}
          {view === "preview" && authed && (
            <PublicSite data={draft} theme={theme} setTheme={setTheme}
              onOpenProject={openProject("preview")}
              openAdmin={() => setView("admin")}
              previewBanner onExitPreview={() => setView("admin")} />
          )}
          {view === "login" && (
            <Login onSuccess={() => { setAuthed(true); setView("admin"); }} onBack={() => setView("site")} />
          )}
          {view === "admin" && authed && (
            <Admin data={draft} setData={setDraft}
              saving={saving} publishing={publishing} dirty={dirty}
              publishedAt={published ? published.publishedAt : null}
              onSaveDraft={handleSaveDraft}
              onPublish={handlePublish}
              onExport={handleExport}
              onExportJson={handleExportJson}
              onPreviewDraft={() => setView("preview")}
              onViewSite={() => setView("site")}
              onLogout={() => { if (supabase) supabase.auth.signOut(); setAuthed(false); setView("site"); }} />
          )}
        </>
      )}
      {toast && <div className="ad-toast">{toast}</div>}
    </div>
  );
}
