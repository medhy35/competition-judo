// combattants.js
import { data, sauvegarderVersServeur } from './dataManager.js';

const Combattants = (function () {

    function toutLister() {
        return data.combattants;
    }

    function ajouter(combattant) {
        if (
            !combattant.nom ||
            !combattant.sexe ||
            !combattant.poids ||
            !combattant.equipe_id
        ) {
            throw new Error(
                "Données du combattant incomplètes (nom, sexe, poids, equipe_id requis)"
            );
        }
        combattant.id = Date.now(); // id unique simple
        data.combattants.push(combattant);
        sauvegarderVersServeur();
        return combattant.id;
    }

    function modifier(combattant) {
        if (!combattant.id) throw new Error("Combattant sans ID");
        const idx = data.combattants.findIndex(c => c.id === combattant.id);
        if (idx === -1) throw new Error("Combattant non trouvé");
        data.combattants[idx] = combattant;
        sauvegarderVersServeur();
    }

    function supprimer(id) {
        if (!id) throw new Error("ID obligatoire pour suppression");
        data.combattants = data.combattants.filter(c => c.id !== id);
        sauvegarderVersServeur();
    }

    function listerParEquipe(equipe_id) {
        if (!equipe_id) throw new Error("ID équipe obligatoire pour filtrage");
        return data.combattants.filter(c => c.equipe_id === equipe_id);
    }

    function vider() {
        data.combattants = [];
        sauvegarderVersServeur();
    }

    function reset() {
        return vider();
    }

    function exportJSON() {
        return JSON.stringify(data.combattants);
    }

    function importJSON(jsonStr) {
        try {
            const arr = JSON.parse(jsonStr);
            if (!Array.isArray(arr)) throw new Error("Format JSON invalide");
            data.combattants = arr;
            sauvegarderVersServeur();
        } catch (e) {
            throw new Error("Erreur import JSON Combattants : " + e.message);
        }
    }

    return {
        toutLister,
        ajouter,
        modifier,
        supprimer,
        listerParEquipe,
        vider,
        reset,
        exportJSON,
        importJSON,
    };
})();

export default Combattants;
