/* ============================================================
   Fonction serverless Vercel : extraction de CV (PDF) via l'API Anthropic
   La clé API reste côté serveur (variable d'environnement ANTHROPIC_API_KEY,
   à créer sur https://console.anthropic.com puis à ajouter dans
   Vercel -> Settings -> Environment Variables -> ANTHROPIC_API_KEY).
   Ne JAMAIS préfixer cette variable par VITE_ ou NEXT_PUBLIC_ :
   elle ne doit pas être exposée au navigateur.
   ============================================================ */

const PROMPT = `Voici le CV d'un designer au format PDF. Extrais toutes les expériences professionnelles (et les formations si elles sont présentes), de la plus récente à la plus ancienne.

Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte avant ou après, sans backticks Markdown, au format exact suivant :
{"experiences":[{"dates":"2022 → Aujourd'hui","title":"Intitulé du poste — Entreprise","description":"Résumé de la mission en 2 phrases maximum, en français."}]}

Règles :
- "dates" : la période telle qu'indiquée dans le CV, reformatée "AAAA → AAAA" ou "AAAA → Aujourd'hui".
- "title" : intitulé du poste suivi d'un tiret cadratin et du nom de l'entreprise (ou de l'école pour une formation).
- "description" : synthèse concise en français des responsabilités ou du diplôme. Reste fidèle au contenu du CV sans rien inventer.
- Si une information est absente, mets une chaîne vide.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error:
        "Import de CV non configuré : ajoutez la variable ANTHROPIC_API_KEY dans Vercel (Settings → Environment Variables) puis redéployez.",
    });
    return;
  }

  const { pdfBase64 } = req.body || {};
  if (!pdfBase64 || typeof pdfBase64 !== "string") {
    res.status(400).json({ error: "PDF manquant dans la requête." });
    return;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      const msg = (data && data.error && data.error.message) || "Erreur de l'API Anthropic.";
      res.status(502).json({ error: msg });
      return;
    }

    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      res.status(502).json({ error: "Réponse inattendue du modèle, réessayez." });
      return;
    }

    if (!parsed || !Array.isArray(parsed.experiences) || parsed.experiences.length === 0) {
      res.status(422).json({ error: "Aucune expérience détectée dans ce PDF." });
      return;
    }

    res.status(200).json({ experiences: parsed.experiences });
  } catch (e) {
    console.error("extract-cv error:", e);
    res.status(500).json({ error: "Erreur interne du service d'import de CV." });
  }
}
