"use client";

import { useCallback, useEffect, useState } from "react";
import { faTrello } from "@fortawesome/free-brands-svg-icons";
import { faArrowRotateRight, faArrowUpRightFromSquare, faCircleCheck, faLink, faLinkSlash, faPlay, faStop } from "@fortawesome/free-solid-svg-icons";
import type { TrelloBoardState, TrelloConnection } from "@/lib/domain/trello";
import {
  connectTrelloAction,
  disableTrelloBoardAction,
  disconnectTrelloAction,
  enableTrelloBoardAction,
  listTrelloBoardsAction,
  setTrelloBoardProjectAction,
} from "@/actions/trello";
import { useAction } from "@/components/ui/use-action";
import { useFeedback } from "@/components/ui/feedback";
import { Icon } from "@/components/ui/icon";

interface ProjectOption {
  id: string;
  name: string;
}

const STATUS_HINT = "« À faire » / « To do » → À faire · « En cours » / « Doing » → En cours · « Validation » / « Review » → En revue · « Terminé » / « Done » → Terminée";

function ConnectForm() {
  const { exec, pending } = useAction();
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");
  const keyOk = /^[0-9a-f]{32}$/i.test(apiKey.trim());
  const authorizeUrl = `https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&name=AI-nvoices&key=${encodeURIComponent(apiKey.trim())}`;

  return (
    <ol className="flex max-w-3xl flex-col gap-5 text-[14px]">
      <li>
        <p className="mb-2">
          <span className="text-primary">1.</span> Sur{" "}
          <a href="https://trello.com/power-ups/admin" target="_blank" rel="noopener noreferrer" className="link">
            trello.com/power-ups/admin <Icon icon={faArrowUpRightFromSquare} className="text-[11px]" />
          </a>
          , créez un Power-Up (nom libre, par exemple « AI-nvoices »), puis dans l&apos;onglet <em>API key</em>, cliquez sur <em>Generate a new API key</em>.
        </p>
        <input className="input max-w-[420px] tabular" placeholder="Clé API (32 caractères)" value={apiKey} onChange={(e) => setApiKey(e.target.value)} aria-label="Clé API Trello" />
      </li>
      <li>
        <p className="mb-2">
          <span className="text-primary">2.</span> Autorisez AI-nvoices à lire vos tableaux (accès en lecture seule), puis copiez le jeton affiché.
        </p>
        <a href={keyOk ? authorizeUrl : undefined} target="_blank" rel="noopener noreferrer" className={`btn btn-sm ${keyOk ? "" : "pointer-events-none opacity-50"}`} aria-disabled={!keyOk}>
          <Icon icon={faTrello} /> Générer le jeton Trello
        </a>
      </li>
      <li>
        <p className="mb-2">
          <span className="text-primary">3.</span> Collez le jeton et connectez.
        </p>
        <div className="flex flex-wrap gap-3">
          <input className="input max-w-[420px] tabular" placeholder="Jeton Trello" value={token} onChange={(e) => setToken(e.target.value)} aria-label="Jeton Trello" />
          <button type="button" className="btn btn-primary" disabled={pending || !keyOk || token.trim().length < 32} onClick={() => exec(() => connectTrelloAction(apiKey, token), "Trello connecté")}>
            <Icon icon={faLink} /> Connecter
          </button>
        </div>
      </li>
    </ol>
  );
}

function BoardRow({ board, projects, onChanged }: { board: TrelloBoardState; projects: ProjectOption[]; onChanged: () => void }) {
  const { exec, pending } = useAction();
  const { confirm, toast } = useFeedback();
  const [project, setProject] = useState(board.sync?.project_id ?? "");
  const [importExisting, setImportExisting] = useState(true);
  const synced = board.sync !== null;

  const enable = async () => {
    const res = await exec(() => enableTrelloBoardAction(board.board_id, project || null, importExisting));
    if (!res.ok) return;
    const n = res.data?.imported ?? 0;
    toast(importExisting ? `« ${board.name} » synchronisé : ${n} tâche${n > 1 ? "s" : ""} importée${n > 1 ? "s" : ""}` : `« ${board.name} » synchronisé`, "success");
    onChanged();
  };
  const disable = async () => {
    if (!board.sync) return;
    const ok = await confirm({ message: `Arrêter la synchronisation de « ${board.name} » ? Les tâches déjà créées restent dans AI-nvoices.`, confirmLabel: "Arrêter" });
    if (ok && (await exec(() => disableTrelloBoardAction(board.sync!.id), "Synchronisation arrêtée")).ok) onChanged();
  };
  const changeProject = (value: string) => {
    setProject(value);
    if (board.sync && value) void exec(() => setTrelloBoardProjectAction(board.sync!.id, value), "Projet mis à jour");
  };

  return (
    <li className={`flex flex-wrap items-center gap-3 rounded-ui border px-4 py-3 ${synced ? "border-success/40 bg-success/5" : "border-border bg-surface-2"}`}>
      <a href={board.url} target="_blank" rel="noopener noreferrer" className="min-w-[180px] flex-1 truncate hover:text-primary" title={board.name}>
        {board.name}
      </a>
      {synced && (
        <span className="badge bg-success/15 text-success">
          <Icon icon={faCircleCheck} className="mr-1.5" /> Synchronisé
        </span>
      )}
      <select className="select max-w-[240px]" value={project} onChange={(e) => changeProject(e.target.value)} disabled={pending} aria-label="Projet cible">
        {!synced && <option value="">Projet « {board.name} »</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {synced ? (
        <button type="button" className="btn btn-sm" onClick={disable} disabled={pending}>
          <Icon icon={faStop} /> Arrêter
        </button>
      ) : (
        <>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" className="checkbox" checked={importExisting} onChange={(e) => setImportExisting(e.target.checked)} />
            Importer les cartes existantes
          </label>
          <button type="button" className="btn btn-sm btn-primary" onClick={enable} disabled={pending}>
            <Icon icon={faPlay} /> {pending ? "Activation…" : "Synchroniser"}
          </button>
        </>
      )}
    </li>
  );
}

/** Connexion Trello : les cartes des tableaux synchronisés deviennent des tâches. */
export function TrelloManager({ connection, projects }: { connection: TrelloConnection | null; projects: ProjectOption[] }) {
  const { exec, pending } = useAction();
  const { confirm } = useFeedback();
  const [boards, setBoards] = useState<TrelloBoardState[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await listTrelloBoardsAction();
    setLoading(false);
    if (res.ok) setBoards(res.data ?? []);
  }, []);

  useEffect(() => {
    if (connection) void load();
    else setBoards(null);
  }, [connection, load]);

  const disconnect = async () => {
    const ok = await confirm({ message: "Déconnecter Trello ? La synchronisation de tous les tableaux s'arrête. Les tâches déjà créées restent.", confirmLabel: "Déconnecter" });
    if (ok) await exec(() => disconnectTrelloAction(), "Trello déconnecté");
  };

  return (
    <section className="card px-6 py-5">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2.5 text-[18px]">
          <Icon icon={faTrello} className="text-[#0C66E4]" /> Trello
        </h2>
        {connection && (
          <>
            <span className="text-[13px] text-muted">Connecté : {connection.member_name}</span>
            <button type="button" className="btn btn-sm ml-auto" onClick={disconnect} disabled={pending}>
              <Icon icon={faLinkSlash} /> Déconnecter
            </button>
          </>
        )}
      </div>
      <p className="mb-5 max-w-3xl text-[14px] text-muted">
        Chaque carte créée sur un tableau synchronisé devient une tâche dans le projet choisi. Les renommages, échéances et déplacements de liste suivent automatiquement.
      </p>

      {!connection ? (
        <ConnectForm />
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="label mb-0">Vos tableaux</p>
            <button type="button" className="btn btn-sm" onClick={load} disabled={loading}>
              <Icon icon={faArrowRotateRight} className={loading ? "animate-spin" : ""} /> Actualiser
            </button>
          </div>
          {boards === null ? (
            <p className="py-6 text-center text-muted">{loading ? "Chargement des tableaux…" : "Impossible de charger vos tableaux."}</p>
          ) : boards.length === 0 ? (
            <p className="py-6 text-center text-muted">Aucun tableau ouvert sur ce compte Trello.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {boards.map((b) => (
                <BoardRow key={b.board_id} board={b} projects={projects} onChanged={load} />
              ))}
            </ul>
          )}
          <p className="mt-4 text-[12px] text-dim">Statut d&apos;après le nom de la liste : {STATUS_HINT}. Les autres listes donnent « À faire ».</p>
        </>
      )}
    </section>
  );
}
