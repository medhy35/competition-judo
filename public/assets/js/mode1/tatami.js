// js/mode1/tatamis.js

const Tatamis = (() => {
    const ENDPOINT = '/api/tatamis';

    async function creer(nom) {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom })
        });
        return await res.json();
    }

    async function supprimer(id) {
        const res = await fetch(`${ENDPOINT}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Erreur lors de la suppression du tatami");
    }

    async function get(id) {
        const res = await fetch(`${ENDPOINT}/${id}`);
        if (!res.ok) throw new Error("Tatami introuvable");
        return await res.json();
    }

    async function lister() {
        const res = await fetch(ENDPOINT);
        return await res.json();
    }

    async function assignerCombat(tatamiId, combatId) {
        const res = await fetch(`${ENDPOINT}/${tatamiId}/assigner`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ combatId })
        });
        return await res.json();
    }

    async function getCombatActuel(tatamiId) {
        const res = await fetch(`${ENDPOINT}/${tatamiId}/combat-actuel`);
        if (!res.ok) return null;
        return await res.json();
    }

    async function allerAuCombatSuivant(tatamiId) {
        const res = await fetch(`${ENDPOINT}/${tatamiId}/suivant`, { method: 'POST' });
        if (!res.ok) throw new Error("Impossible de passer au combat suivant");
        return await res.json();
    }

    async function allerAuCombatPrecedent(tatamiId) {
        const res = await fetch(`${ENDPOINT}/${tatamiId}/precedent`, { method: 'POST' });
        if (!res.ok) throw new Error("Impossible de revenir au combat précédent");
        return await res.json();
    }

    async function liberer(tatamiId) {
        const res = await fetch(`${ENDPOINT}/${tatamiId}/liberer`, { method: 'POST' });
        if (!res.ok) throw new Error("Erreur lors de la libération du tatami");
    }

    async function changerEtat(tatamiId, nouvelEtat) {
        const res = await fetch(`${ENDPOINT}/${tatamiId}/etat`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ etat: nouvelEtat })
        });
        if (!res.ok) throw new Error("Erreur de changement d'état");
        return await res.json();
    }

    async function getEtat(tatamiId) {
        const tatami = await get(tatamiId);
        return tatami.etat;
    }

    return {
        creer,
        supprimer,
        get,
        lister,
        assignerCombat,
        getCombatActuel,
        allerAuCombatSuivant,
        allerAuCombatPrecedent,
        liberer,
        changerEtat,
        getEtat
    };
})();

export default Tatamis;
