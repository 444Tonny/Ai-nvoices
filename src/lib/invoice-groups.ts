/**
 * Regroupement des lignes de facture par projet (utilisé par l'app et le PDF).
 * Les lignes sans projet vont dans « Autres », toujours placé en dernier.
 * Avec un seul groupe, l'affichage reste une table plate.
 */
export const OTHER_GROUP = "Autres";

export interface ItemGroup<T> {
  name: string;
  items: T[];
}

export function groupByProject<T extends { project_name: string | null }>(items: T[]): ItemGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.project_name ?? OTHER_GROUP;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  const groups = [...map.entries()].map(([name, list]) => ({ name, items: list }));
  return groups.sort((a, b) => {
    if (a.name === OTHER_GROUP) return 1;
    if (b.name === OTHER_GROUP) return -1;
    return 0;
  });
}
