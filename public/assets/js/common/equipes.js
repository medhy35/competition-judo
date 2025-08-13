// equipes.js
import { data, sauvegarderVersServeur } from './dataManager.js';

const Equipes = (function () {

    function lister() {
        return data.equipes;
    }

    function ajouter(equipe) {
        if (!equipe.nom) throw new Error("Équipe invalide : nom obligatoire");
        equipe.id = Date.now(); // id simple unique
        data.equipes.push(equipe);
        sauvegarderVersServeur();
        return equipe.id;
    }

    function modifier(equipeModif) {
        if (!equipeModif.id) throw new Error("Équipe invalide : id obligatoire");
        const idx = data.equipes.findIndex(e => e.id === equipeModif.id);
        if (idx === -1) throw new Error("Équipe non trouvée");
        data.equipes[idx] = equipeModif;
        sauvegarderVersServeur();
    }

    function supprimer(idEquipe) {
        if (!idEquipe) throw new Error("ID équipe obligatoire pour suppression");
        data.equipes = data.equipes.filter(e => e.id !== idEquipe);
        sauvegarderVersServeur();
    }

    function trouver(idEquipe) {
        if (!idEquipe) throw new Error("ID équipe obligatoire pour recherche");
        return data.equipes.find(e => e.id === idEquipe) || null;
    }

    function reset() {
        data.equipes = [];
        sauvegarderVersServeur();
    }

    function exportJSON() {
        return JSON.stringify(data.equipes);
    }

    function importJSON(jsonStr) {
        try {
            const arr = JSON.parse(jsonStr);
            if (!Array.isArray(arr)) throw new Error("Format JSON invalide");
            data.equipes = arr;
            sauvegarderVersServeur();
        } catch (e) {
            throw new Error("Erreur import JSON Équipes : " + e.message);
        }
    }

    return {
        lister,
        ajouter,
        modifier,
        supprimer,
        trouver,
        reset,
        exportJSON,
        importJSON,
    };
})();

export default Equipes;
