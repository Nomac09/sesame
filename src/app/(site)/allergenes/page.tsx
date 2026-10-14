import { A, Article, LegalPage, P, Strong, Ul } from "@/components/legal/prose";
import {
  ALLERGENS_PENDING_LABEL,
  ALLERGEN_LABELS,
  DIETARY_LABELS,
  VISIBLE_MENU,
  type MenuItem,
} from "@/config/menu";
import { LEGAL, nationalPhone } from "@/config/legal";

export const metadata = {
  title: "Allergènes, Sesame",
  description:
    "Récapitulatif des allergènes à déclaration obligatoire présents dans chaque article de la carte.",
};

/**
 * Récapitulatif des allergènes, article R412-12-1 du code de la consommation.
 *
 * L'information par article figure déjà sur chaque fiche de la carte, ce qui
 * satisfait l'obligation d'information préalable pour la vente à distance.
 * Cette page existe pour l'usage réel: un client allergique veut lire la carte
 * dans l'autre sens, en partant de l'allergène et non du plat.
 *
 * Rendu depuis VISIBLE_MENU: un article ajouté à la carte apparaît ici sans
 * intervention, et un article soumis à une licence non détenue n'y figure pas.
 */

function allergenLine(item: MenuItem): string {
  if (item.allergensPending) return ALLERGENS_PENDING_LABEL;
  if (item.allergens.length === 0) return "Aucun des quatorze allergènes déclarés";
  return item.allergens.map((key) => ALLERGEN_LABELS[key]).join(", ");
}

export default function AllergenesPage() {
  const phone = nationalPhone();

  // Ordre stable et lisible: on part de la carte, pas d'un tri alphabétique
  // qui séparerait les articles d'une même catégorie.
  const used = new Set(
    VISIBLE_MENU.flatMap((category) =>
      category.items.flatMap((item) => item.allergens),
    ),
  );

  return (
    <LegalPage
      title="Allergènes"
      intro="Les allergènes de chaque article, également indiqués sur sa fiche dans la carte. Information fournie au titre du règlement (UE) n° 1169/2011."
    >
      <Article title="Avant tout">
        <Strong>
          La cuisine est unique et manipule sésame, gluten, lait et fruits à
          coque dans le même espace. Une même huile sert à plusieurs
          préparations frites. L&apos;absence de traces ne peut pas être garantie,
          même pour un article dont la recette ne contient pas l&apos;allergène.
        </Strong>
        <P>
          En cas d&apos;allergie sévère, indiquez-la dans le commentaire de votre
          commande, ou appelez avant de commander:{" "}
          {phone ? <span className="tabular">{phone}</span> : null}
          {phone && LEGAL.contactEmail ? ", " : ""}
          {LEGAL.contactEmail ? (
            <A href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</A>
          ) : null}
          . Nous répondons avant la préparation, pas après.
        </P>
      </Article>

      <Article title="Allergènes présents sur la carte">
        {/* `capitalize` mettrait une majuscule à chaque mot, "Fruits À Coque".
            Seule la première lettre doit changer. */}
        <Ul>
          {[...used].map((key) => (
            <li key={key} className="first-letter:uppercase">
              {ALLERGEN_LABELS[key]}
            </li>
          ))}
        </Ul>
        <P>
          Les autres allergènes de la liste réglementaire, notamment crustacés,
          oeufs, poissons, arachides, soja, céleri, moutarde, lupin et
          mollusques, n&apos;entrent pas dans nos recettes. Les sulfites concernent
          uniquement le vin.
        </P>
      </Article>

      {VISIBLE_MENU.map((category) => (
        <Article key={category.id} title={category.name}>
          <div className="mt-1">
            {category.items.map((item) => (
              <div key={item.id} className="rule-b py-3.5">
                <p className="font-display text-item text-ink">{item.name}</p>
                <p className="mt-1 text-fine text-muted">{allergenLine(item)}</p>
                {item.tags.length > 0 ? (
                  <p className="mt-1.5 text-micro text-muted">
                    {item.tags.map((tag) => DIETARY_LABELS[tag]).join(" - ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </Article>
      ))}

      <Article title="Mise à jour">
        <P>
          Les recettes évoluent rarement, mais elles évoluent. Cette page est
          générée à partir de la carte publiée: elle ne peut pas être en retard
          sur elle. Un article dont la composition est en cours de vérification
          porte la mention correspondante plutôt qu&apos;une liste vide.
        </P>
        <P>
          Les conditions de vente figurent dans les{" "}
          <A href="/cgv">conditions générales de vente</A>.
        </P>
      </Article>
    </LegalPage>
  );
}
