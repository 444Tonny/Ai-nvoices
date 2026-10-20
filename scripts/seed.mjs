/**
 * Seed de démonstration AI-nvoices.
 *
 *   npm run seed
 *
 * Variables lues dans .env.local (ou .env) :
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   SEED_USER_EMAIL (défaut demo@ai-nvoices.local), SEED_USER_PASSWORD (défaut demo1234)
 *
 * Crée (ou réutilise) un utilisateur de démo confirmé, efface SES données,
 * puis insère clients, projets, tâches, six semaines d'entrées de temps et deux factures.
 * La clé service_role contourne la RLS : ce script ne doit jamais tourner côté client.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SEED_USER_EMAIL || "demo@ai-nvoices.local";
const password = process.env.SEED_USER_PASSWORD || "demo1234";

if (!url || !serviceKey) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis (.env.local).");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function check(res, label) {
  if (res.error) {
    console.error(`✗ ${label} :`, res.error.message);
    process.exit(1);
  }
  return res.data;
}

// PRNG déterministe : le seed produit toujours les mêmes données.
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

async function findOrCreateUser() {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 200) break;
  }
  const created = check(await db.auth.admin.createUser({ email, password, email_confirm: true }), "création de l'utilisateur");
  return created.user;
}

async function main() {
  const user = await findOrCreateUser();
  const uid = user.id;
  console.log(`→ Utilisateur de démo : ${email} (${uid})`);

  // Nettoyage des données de cet utilisateur uniquement.
  for (const table of ["invoices", "invoice_items", "user_timer_state", "time_entries", "tasks", "projects", "clients"]) {
    check(await db.from(table).delete().eq("user_id", uid), `nettoyage ${table}`);
  }

  // Profil émetteur (créé par le trigger d'inscription, complété ici).
  let templates = check(await db.from("invoice_templates").select("id").eq("user_id", uid).order("created_at"), "profils");
  const templateData = {
    user_id: uid,
    name: "Profil principal",
    company_name: "Studio Démo",
    address: "10 avenue des Freelances\n69002 Lyon",
    email,
    phone: "+33 6 00 00 00 00",
    website: "studio-demo.fr",
    bank_details: "IBAN FR76 3000 6000 0112 3456 7890 189\nBIC AGRIFRPP",
    tax_number: "FR12 345678901",
  };
  if (templates.length === 0) {
    templates = check(await db.from("invoice_templates").insert(templateData).select("id"), "profil émetteur");
  } else {
    check(await db.from("invoice_templates").update(templateData).eq("id", templates[0].id), "profil émetteur");
  }
  const templateId = templates[0].id;

  const clients = check(
    await db
      .from("clients")
      .insert([
        { user_id: uid, name: "Acme SAS", hourly_rate: 65, currency: "EUR", email: "compta@acme.fr", phone: "+33 1 23 45 67 89", address: "1 rue de la Paix\n75002 Paris" },
        { user_id: uid, name: "Globex Corporation", hourly_rate: 80, currency: "USD", email: "billing@globex.com", address: "742 Evergreen Terrace\nSpringfield, USA" },
        { user_id: uid, name: "Fanorona Digital", hourly_rate: 120000, currency: "MGA", email: "contact@fanorona.mg", address: "Lot II A 45\nAntananarivo" },
      ])
      .select("id, name"),
    "clients",
  );
  const [acme, globex, fanorona] = clients;

  const projects = check(
    await db
      .from("projects")
      .insert([
        { user_id: uid, name: "Site vitrine", description: "Refonte du site corporate", client_id: acme.id, color: "#BC6FF1" },
        { user_id: uid, name: "Application mobile", description: "App React Native", client_id: acme.id, color: "#2ECC81", hourly_rate: 75 },
        { user_id: uid, name: "Dashboard analytics", client_id: globex.id, color: "#F5A623" },
        { user_id: uid, name: "E-commerce", client_id: fanorona.id, color: "#A78BDA" },
        { user_id: uid, name: "Interne", description: "Administratif, veille", client_id: null, color: "#8368B8", billable: false },
      ])
      .select("id, name"),
    "projets",
  );
  const byName = Object.fromEntries(projects.map((p) => [p.name, p.id]));

  const inDays = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  // [nom, projet, statut, priorité, échéance (jours), estimation (minutes)]
  const taskDefs = [
    ["Maquettes Figma", "Site vitrine", "done", "high", null, 720],
    ["Intégration HTML/CSS", "Site vitrine", "in_progress", "high", 5, 960],
    ["SEO technique", "Site vitrine", "todo", "normal", 14, 240],
    ["Écran de connexion", "Application mobile", "review", "urgent", 1, 480],
    ["Notifications push", "Application mobile", "todo", "normal", 21, 360],
    ["Modélisation des données", "Dashboard analytics", "in_progress", "high", 3, 600],
    ["Graphiques temps réel", "Dashboard analytics", "todo", "normal", null, null],
    ["Catalogue produits", "E-commerce", "in_progress", "normal", 10, 720],
    ["Paiement mobile money", "E-commerce", "todo", "urgent", -2, 480],
    ["Comptabilité", "Interne", "todo", "low", null, null],
    ["Veille technique", null, "todo", null, null, null],
  ];
  const tasks = check(
    await db
      .from("tasks")
      .insert(
        taskDefs.map(([name, project, status, priority, due, estimate], i) => ({
          user_id: uid,
          name,
          project_id: project ? byName[project] : null,
          status,
          priority,
          due_date: due === null ? null : inDays(due),
          estimate_minutes: estimate,
          position: i + 1,
        })),
      )
      .select("id, name"),
    "tâches",
  );

  // Six semaines d'entrées, jours ouvrés, 2 à 4 sessions par jour entre 9h et 18h (UTC).
  const entries = [];
  const today = new Date();
  const notes = ["Revue avec le client", "Corrections", "Recherche", null, null, null];
  for (let d = 42; d >= 1; d--) {
    const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - d));
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    let cursor = 8 * 60 + Math.floor(rand() * 60);
    const sessions = 2 + Math.floor(rand() * 3);
    for (let s = 0; s < sessions && cursor < 17 * 60; s++) {
      const duration = 45 + Math.floor(rand() * 150);
      const start = new Date(day.getTime() + cursor * 60_000);
      const end = new Date(start.getTime() + duration * 60_000);
      entries.push({ user_id: uid, task_id: pick(tasks).id, start_time: start.toISOString(), end_time: end.toISOString(), description: pick(notes) });
      cursor += duration + 15 + Math.floor(rand() * 45);
    }
  }
  entries.push({
    user_id: uid,
    task_id: tasks[1].id,
    start_time: new Date(Date.now() - 3 * 3600_000).toISOString(),
    end_time: new Date(Date.now() - 2 * 3600_000).toISOString(),
    description: "Header responsive",
  });
  check(await db.from("time_entries").insert(entries), "entrées de temps");

  // Deux factures : une payée (temps verrouillé), une non payée (temps rattaché, heures automatiques).
  const year = today.getUTCFullYear();
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const invoices = check(
    await db
      .from("invoices")
      .insert([
        {
          user_id: uid, number: `FAC-${year}-001`, client_id: acme.id, template_id: templateId, status: "unpaid", currency: "EUR",
          invoice_date: iso(new Date(Date.now() - 21 * 86400_000)), issue_date: iso(new Date(Date.now() - 21 * 86400_000)),
          due_date: iso(new Date(Date.now() + 9 * 86400_000)), footer_text: "Paiement à 30 jours par virement.",
        },
        {
          user_id: uid, number: `FAC-${year}-002`, client_id: acme.id, template_id: templateId, status: "unpaid", currency: "EUR",
          invoice_date: iso(today), issue_date: iso(today), due_date: iso(new Date(Date.now() + 30 * 86400_000)),
          notes: "Merci pour votre confiance.", footer_text: "Paiement à 30 jours par virement.",
        },
      ])
      .select("id, number"),
    "factures",
  );
  const taskId = (name) => tasks.find((t) => t.name === name).id;
  const items = check(
    await db
      .from("invoice_items")
      .insert([
        { user_id: uid, invoice_id: invoices[0].id, description: "Maquettes Figma", quantity: 0, unit_price: 65, task_id: taskId("Maquettes Figma"), source: "time", position: 0 },
        { user_id: uid, invoice_id: invoices[0].id, description: "Cadrage (offert)", quantity: 2, unit_price: 65, discount: 100, source: "manual", position: 1 },
        { user_id: uid, invoice_id: invoices[1].id, description: "Écran de connexion", quantity: 0, unit_price: 75, discount: 10, task_id: taskId("Écran de connexion"), source: "time", position: 0 },
        { user_id: uid, invoice_id: invoices[1].id, description: "Hébergement (forfait)", quantity: 1, unit_price: 120, source: "manual", position: 1 },
      ])
      .select("id, description"),
    "lignes de facture",
  );
  const itemId = (d) => items.find((i) => i.description === d).id;
  // Rattache le temps aux lignes : les triggers recalculent les quantités.
  const cutoff = new Date(Date.now() - 21 * 86400_000).toISOString();
  check(
    await db.from("time_entries").update({ invoice_item_id: itemId("Maquettes Figma") }).eq("user_id", uid).eq("task_id", taskId("Maquettes Figma")).lt("start_time", cutoff),
    "temps de la facture 1",
  );
  check(
    await db.from("time_entries").update({ invoice_item_id: itemId("Écran de connexion") }).eq("user_id", uid).eq("task_id", taskId("Écran de connexion")),
    "temps de la facture 2",
  );
  check(await db.from("invoices").update({ status: "paid" }).eq("id", invoices[0].id), "facture payée");

  console.log(`✓ Seed terminé : ${clients.length} clients, ${projects.length} projets, ${tasks.length} tâches, ${entries.length} entrées, ${invoices.length} factures.`);
  console.log(`  Connectez-vous avec ${email} / ${password}`);
}

main().catch((e) => {
  console.error("✗", e.message ?? e);
  process.exit(1);
});
