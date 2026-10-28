import { FontAwesomeIcon, type FontAwesomeIconProps } from "@fortawesome/react-fontawesome";
import { config } from "@fortawesome/fontawesome-svg-core";

// La feuille de style Font Awesome est importée dans le layout racine :
// pas d'injection à l'exécution (évite le « flash » d'icônes géantes au rendu serveur).
config.autoAddCss = false;

/** Icône Font Awesome (Free), décorative par défaut. */
export function Icon({ className, ...props }: FontAwesomeIconProps) {
  return <FontAwesomeIcon aria-hidden className={`shrink-0 ${className ?? ""}`} {...props} />;
}
