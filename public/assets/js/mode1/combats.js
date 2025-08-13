// js/mode1/combats.js

const Combats = (() => {
    const ENDPOINT = '/api/combats';

    async function lister() {
        const res = await fetch(ENDPOINT);
        return await res.json();
    }

    async function get(id) {
        const res = await fetch(`${ENDPOINT}/${id}`);
        if (!res.ok) throw new Error("Combat introuvable");
        return await res.json();
    }

    async function creer(rouge, bleu) {
        const res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rouge, bleu })
        });
        return await res.json(); // retourne le combat créé
    }

    async function supprimer(id) {
        const res = await fetch(`${ENDPOINT}/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Erreur suppression");
    }

    async function ajouterPoints(id, cote, typePoint) {
        const res = await fetch(`${ENDPOINT}/${id}/points`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cote, typePoint })
        });
        return await res.json();
    }

    async function changerEtat(id, etat) {
        const res = await fetch(`${ENDPOINT}/${id}/etat`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ etat })
        });
        return await res.json();
    }

    async function majTimer(id, timer) {
        const res = await fetch(`${ENDPOINT}/${id}/timer`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ timer })
        });
        return await res.json();
    }

    async function reset(id) {
        const res = await fetch(`${ENDPOINT}/${id}/reset`, { method: 'POST' });
        return await res.json();
    }

    return {
        creer,
        supprimer,
        get,
        lister,
        ajouterPoints,
        changerEtat,
        majTimer,
        reset
    };
})();
export default Combats;
