// src/controllers/combattants.js
const dataService = require('../services/databaseAdapter');
const configService = require('../services/configService');

class CombattantsController {
    /**
     * GET /api/combattants
     */
    async getAll(req, res) {
        try {
            const combattants = await dataService.getAllCombattants();
            res.json(combattants);
        } catch (error) {
            console.error('Erreur récupération combattants:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/:id
     */
    async getById(req, res) {
        try {
            const combattant_id = +req.params.id;
            const combattant = await dataService.getCombattantById(combattant_id);

            if (!combattant) {
                return res.status(404).json({ error: 'Combattant introuvable' });
            }

            // Ajouter les informations de l'équipe
            const equipe = await dataService.getEquipeById(combattant.equipe_id || combattant.equipe_id);
            const combattant_complet = {
                ...combattant,
                equipe: equipe ? { id: equipe.id, nom: equipe.nom, couleur: equipe.couleur } : null
            };

            res.json(combattant_complet);
        } catch (error) {
            console.error('Erreur récupération combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/combattants
     */
    async create(req, res) {
        try {
            const { nom, sexe, poids, equipe_id } = req.body;

            if (!nom || !sexe || !poids || !equipe_id) {
                return res.status(400).json({ error: 'Tous les champs sont requis' });
            }

            // Vérifier que l'équipe existe
            const equipe = await dataService.getEquipeById(equipe_id);
            if (!equipe) {
                return res.status(400).json({ error: 'Équipe introuvable' });
            }

            // Vérifier le format du poids
            if (typeof poids !== 'string' && typeof poids !== 'number') {
                return res.status(400).json({ error: 'Format de poids invalide' });
            }


            // Vérifier le sexe
            if (!['M', 'F'].includes(sexe)) {
                return res.status(400).json({ error: 'Sexe doit être M ou F' });
            }
            const categories_poids = configService.get('combattants.categoriesPoids');
            const categories_valides = sexe === 'M'
                ? categories_poids.masculin
                : categories_poids.feminin;

            if (!categories_valides.includes(poids)) {
                return res.status(400).json({
                    error: 'Catégorie de poids invalide',
                    categoriesValides: categories_valides
                });
            }
            const combattants_equipe = await dataService.getCombattantsByEquipe(equipe_id);
            const max_combattants = configService.get('equipes.maxCombattantsParEquipe', 20);

            if (combattants_equipe.length >= max_combattants) {
                return res.status(400).json({
                    error: `Nombre maximum de combattants atteint (${max_combattants})`
                });
            }

            const new_combattant = {
                nom: nom.trim(),
                sexe,
                poids,
                equipe_id,
                date_creation: new Date().toISOString()
            };

            const combattant = await dataService.createCombattant(new_combattant);
            dataService.addLog(`Nouveau combattant créé: ${nom}`, {
                combattant_id: combattant.id,
                equipe_id,
                poids,
                sexe
            });
            res.locals.combattant = combattant;
            res.status(201).json(combattant);
        } catch (error) {
            console.error('Erreur création combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/combattants/:id
     */
    async update(req, res) {
        try {
            const combattant_id = +req.params.id;
            const updates = req.body;

            const combattant = await dataService.getCombattantById(combattant_id);
            if (!combattant) {
                return res.status(404).json({ error: 'Combattant non trouvé' });
            }

            // Valider les champs modifiables
            const champs_valides = ['nom', 'sexe', 'poids', 'equipe_id'];
            const updates_filtered = {};

            Object.keys(updates).forEach(key => {
                if (champs_valides.includes(key)) {
                    updates_filtered[key] = updates[key];
                }
            });

            // Vérifications spécifiques
            if (updates_filtered.equipe_id) {
                const equipe = await dataService.getEquipeById(updates_filtered.equipe_id);
                if (!equipe) {
                    return res.status(400).json({ error: 'Équipe introuvable' });
                }
            }

            if (updates_filtered.sexe && !['M', 'F'].includes(updates_filtered.sexe)) {
                return res.status(400).json({ error: 'Sexe doit être M ou F' });
            }

            if (updates_filtered.nom) {
                updates_filtered.nom = updates_filtered.nom.trim();
            }

            const updated_combattant = await dataService.updateCombattant(combattant_id, updates_filtered);

            dataService.addLog(`Combattant modifié: ${updated_combattant.nom}`, {
                combattant_id,
                changes: Object.keys(updates_filtered)
            });
            res.locals.combattant = combattant;
            res.json(updated_combattant);
        } catch (error) {
            console.error('Erreur mise à jour combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * DELETE /api/combattants/:id
     */
    async delete(req, res) {
        try {
            const combattant_id = +req.params.id;

            // Vérifier s'il y a des combats avec ce combattant
            const combats = await dataService.getAllCombats();
            const combats_actifs = combats.filter(c =>
                (c.rouge && (c.rouge.id === combattant_id || c.rouge === combattant_id)) ||
                (c.bleu && (c.bleu.id === combattant_id || c.bleu === combattant_id))
            );

            if (combats_actifs.length > 0) {
                return res.status(400).json({
                    error: `Impossible de supprimer: ${combats_actifs.length} combat(s) associé(s)`
                });
            }

            const deleted = await dataService.deleteCombattant(combattant_id);
            if (!deleted) {
                return res.status(404).json({ error: 'Combattant introuvable' });
            }

            dataService.addLog(`Combattant supprimé`, { combattant_id });
            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/by-equipe/:equipeId
     */
    async getByEquipe(req, res) {
        try {
            const equipe_id = req.params.equipeId;

            const equipe = await dataService.getEquipeById(equipe_id);
            if (!equipe) {
                return res.status(404).json({ error: 'Équipe introuvable' });
            }

            const combattants = await dataService.getCombattantsByEquipe(equipe_id);
            res.json(combattants);
        } catch (error) {
            console.error('Erreur récupération combattants par équipe:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/by-categorie
     */
    async getByCategorie(req, res) {
        try {
            const { poids, sexe } = req.query;

            let combattants = await dataService.getAllCombattants();

            if (poids) {
                combattants = combattants.filter(c => c.poids === poids);
            }

            if (sexe && ['M', 'F'].includes(sexe)) {
                combattants = combattants.filter(c => c.sexe === sexe);
            }

            // Enrichir avec les informations des équipes
            const equipes = await dataService.getAllEquipes();
            const combattants_enrichis = combattants.map(c => {
                const equipe = equipes.find(e => e.id === c.equipe_id);
                return {
                    ...c,
                    equipe: equipe ? { id: equipe.id, nom: equipe.nom, couleur: equipe.couleur } : null
                };
            });

            res.json(combattants_enrichis);
        } catch (error) {
            console.error('Erreur récupération combattants par catégorie:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combattants/:id/combats
     */
    async getCombats(req, res) {
        try {
            const combattant_id = +req.params.id;

            const combattant = await dataService.getCombattantById(combattant_id);
            if (!combattant) {
                return res.status(404).json({ error: 'Combattant introuvable' });
            }

            const combatService = require('../services/combatService');
            const stats = await combatService.getStatsCombattant(combattant_id);

            const combats = await dataService.getAllCombats();
            const combats_combattant_filtered = combats.filter(c =>
                (c.rouge && (c.rouge.id === combattant_id || c.rouge === combattant_id)) ||
                (c.bleu && (c.bleu.id === combattant_id || c.bleu === combattant_id))
            );

            const combats_combattant = await Promise.all(
                combats_combattant_filtered.map(c => combatService.enrichCombat(c))
            );

            res.json({
                combattant,
                combats: combats_combattant,
                stats
            });
        } catch (error) {
            console.error('Erreur récupération combats du combattant:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}

module.exports = new CombattantsController();