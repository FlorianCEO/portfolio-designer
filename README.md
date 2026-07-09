# Portfolio Designer — site autonome

Portfolio de designer avec interface d'administration intégrée, prêt à déployer
sur Vercel, Netlify ou tout hébergeur de sites statiques.

Deux modes de fonctionnement :

- **Avec Supabase (recommandé)** : le contenu vit dans une base de données.
  "Publier" dans l'admin met le site à jour instantanément pour tous les
  visiteurs, et le login admin est une vraie authentification.
- **Sans Supabase** : le contenu vit dans `public/data.json`. "Publier"
  télécharge le fichier à jour, à replacer dans le projet avant de redéployer.

## Structure

- `src/App.jsx` — l'application complète (site public + admin)
- `public/data.json` — contenu de repli si Supabase n'est pas configuré
- `supabase-setup.sql` — script de création de la base de données
- `.env.example` — modèle des variables d'environnement Supabase

## Configuration Supabase (une fois, ~10 minutes)

1. Créez un compte et un projet gratuit sur https://supabase.com
2. Dans le projet : **SQL Editor** → collez le contenu de `supabase-setup.sql`
   → Run. Cela crée la table `portfolio` avec lecture publique et écriture
   réservée aux utilisateurs authentifiés.
3. **Authentication → Users → Add user** : créez l'utilisateur admin
   (ex. thomas@designisvital.co) avec un mot de passe robuste, en cochant
   "Auto Confirm User". Ce sont ces identifiants qui serviront au login admin.
4. **Settings → API** : copiez la "Project URL" et la clé "anon public".
5. Renseignez-les :
   - En local : copiez `.env.example` en `.env` et remplissez les valeurs.
   - Sur Vercel : Settings → Environment Variables → ajoutez
     `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` → redéployez.

C'est tout : au premier "Publier" depuis l'admin, le contenu est écrit en base.

## Lancer en local

```bash
npm install
npm run dev
```

Le site tourne sur http://localhost:5173

## Déployer sur Vercel

1. Pousser ce dossier sur un dépôt GitHub / GitLab.
2. Sur vercel.com → "Add New Project" → importer le dépôt.
3. Vercel détecte Vite automatiquement (build : `npm run build`, output : `dist`).
4. Ajouter les deux variables d'environnement Supabase (voir ci-dessus).
5. Déployer. Chaque `git push` redéploie le code ; le contenu, lui, se met à
   jour via l'admin sans redéploiement.

## Mettre à jour les contenus (mode Supabase)

1. Ouvrir le site → lien "Admin" en bas de page → se connecter avec le compte
   Supabase créé à l'étape 3.
2. Modifier les contenus ("Enregistrer le brouillon" = sauvegarde locale dans
   votre navigateur, invisible des visiteurs).
3. Cliquer "Publier" : le contenu est écrit en base de données et devient
   immédiatement visible par tous les visiteurs. Rien d'autre à faire.

## Limites à connaître

- **Import de CV** : l'appel à l'API Anthropic est authentifié automatiquement
  dans l'artifact Claude, pas ici. Hors de Claude.ai, cette fonctionnalité
  échouera sans clé API (ne jamais mettre une clé API dans le code front —
  il faudrait un petit endpoint serveur). Alternative : faire l'import depuis
  l'artifact, exporter le JSON, et coller les contenus ici.
- **Poids des images** : les images uploadées sont stockées en base64 dans le
  contenu. Elles sont redimensionnées automatiquement, mais pour un site très
  riche en visuels, préférez héberger les images ailleurs et utiliser le champ
  URL (Supabase Storage peut servir à ça, si besoin demandez à Claude de
  brancher l'upload dessus).
- **Sans Supabase configuré**, le login retombe sur la vérification locale
  (identifiants dans le code) : pratique en développement, à ne pas considérer
  comme une sécurité en production.
