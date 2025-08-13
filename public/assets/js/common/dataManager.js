// js/common/dataManager.js

export const data = {
    equipes: [],
    combattants: [],
    combats: [],
    tatamis: []
};

// 🔄 Charger toutes les données depuis le backend
export async function chargerDepuisServeur() {
    try {
        const [eq, cbts, cmbts, tatms] = await Promise.all([
            fetch('/api/equipes').then(r => r.json()),
            fetch('/api/combattants').then(r => r.json()),
            fetch('/api/combats').then(r => r.json()),
            fetch('/api/tatamis').then(r => r.json()),
        ]);
        data.equipes = eq;
        data.combattants = cbts;
        data.combats = cmbts;
        data.tatamis = tatms;
    } catch (err) {
        console.error("Erreur lors du chargement depuis le serveur :", err);
    }
}

// 💾 Sauvegarder toutes les données vers le backend
export async function sauvegarderVersServeur() {
    try {
        await Promise.all([
            fetch('/api/equipes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.equipes)
            }),
            fetch('/api/combattants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.combattants)
            }),
            fetch('/api/combats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.combats)
            }),
            fetch('/api/tatamis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data.tatamis)
            }),
        ]);
    } catch (err) {
        console.error("Erreur lors de la sauvegarde vers le serveur :", err);
    }
}

// ♻️ Réinitialiser les données en mémoire
export function resetData() {
    data.equipes = [];
    data.combattants = [];
    data.combats = [];
    data.tatamis = [];
    sauvegarderVersServeur();
}