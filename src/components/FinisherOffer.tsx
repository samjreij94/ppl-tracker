import { cardioLabel, type FinisherOfferVM } from '../ui/types';

/** Optional zone-2 finisher shown after the last lift until added (skippable by simply ignoring it). */
export function FinisherOffer({ offer, onAdd }: { offer: FinisherOfferVM; onAdd: () => void }) {
  return (
    <section className="card finisher-offer" aria-label="Optional cardio finisher" data-testid="finisher-offer">
      <div className="eyebrow">Optional finisher · {offer.intensity.replace('-', ' ')}</div>
      <div className="name">{cardioLabel(offer.kind, offer.name)} · {offer.minutes} min</div>
      {offer.note && <div className="dim note">{offer.note}</div>}
      <button className="btn btn-lg" style={{ marginTop: 12 }} onClick={onAdd} data-testid="add-finisher">+ Add cardio finisher</button>
    </section>
  );
}
