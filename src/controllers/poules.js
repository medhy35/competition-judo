// src/controllers/poules.js
const dataService = require('../services/databaseAdapter');

class PoulesController {
    /**
     * GET /api/poules
     */
    async getAll(req, res) {
        try {
            const poules = await dataService.getAllPoules();
            res.json(poules);
        } catch (error) {
            console.error('Erreur récupération poules:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/poules/:id
     */
    async getById(req, res) {
        try {
            const poule_id = +req.params.id;
            const poule = await dataService.getPouleById(poule_id);

            if (!poule) {
                return res.status(404).json({ error: 'Poule introuvable' });
            }

            res.json(poule);
        } catch (error) {
            console.error('Erreur récupération poule:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/poules - Création automatique des poules
     */
    async create(req, res) {
        try {
            const nb_poules = parseInt(req.body.nb_poules || 1);

            if (nb_poules <= 0 || nb_poules > 10) {
                return res.status(400).json({ error: 'Nombre de poules invalide (1-10)' });
            }

            const equipes = await dataService.getAllEquipes();
            if (equipes.length === 0) {
                return res.status(400).json({ error: 'Aucune équipe disponible' });
            }

            if (equipes.length < nb_poules) {
                return res.status(400).json({
                    error: `Pas assez d'équipes (${equipes.length}) pour ${nb_poules} poules`
                });
            }

            // Mélange aléatoire des équipes
            const shuffled = [...equipes].sort(() => Math.random() - 0.5);

            // Création des poules
            const poules = Array.from({ length: nb_poules }, (_, i) => ({
                id: i + 1,
                nom: `Poule ${String.fromCharCode(65 + i)}`, // A, B, C, etc.
                equipes_ids: [],
                rencontres: [],
                classement: []
            }));

            // Répartition des équipes dans les poules (round-robin)
            shuffled.forEach((equipe, index) => {
                const poule_index = index % nb_poules;
                poules[poule_index].equipes_ids.push(equipe.id);
                poules[poule_index].classement.push({
                    equipe_id: equipe.id,
                    points: 0,
                    victoires: 0,
                    defaites: 0
                });
            });

            // Génération des rencontres pour chaque poule (round-robin)
            poules.forEach(poule => {
                const equipes_ids = poule.equipes_ids;

                for (let i = 0; i < equipes_ids.length; i++) {
                    for (let j = i + 1; j < equipes_ids.length; j++) {
                        const rencontre_id = dataService.generateId();
                        poule.rencontres.push({
                            id: rencontre_id,
                            equipe_a: equipes_ids[i],
                            equipe_b: equipes_ids[j],
                            combats_ids: [],
                            resultat: null,
                            etat: 'prevue'
                        });
                    }
                }
            });

            // Sauvegarder les poules
            await dataService.createPoules(poules);

            dataService.addLog(`${nb_poules} poules créées avec ${equipes.length} équipes`, {
                nb_poules,
                nb_equipes: equipes.length,
                poules_ids: poules.map(p => p.id)
            });
            res.locals.poule = poules;
            res.status(201).json(poules);
        } catch (error) {
            console.error('Erreur création poules:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/poules/:id
     */
    async update(req, res) {
        try {
            const poule_id = +req.params.id;
            const updates = req.body;

            const poule = await dataService.updatePoule(poule_id, updates);
            if (!poule) {
                return res.status(404).json({ error: 'Poule introuvable' });
            }

            dataService.addLog(`Poule modifiée: ${poule.nom}`, {
                poule_id,
                changes: Object.keys(updates)
            });
            res.locals.poule = poule;
            res.json(poule);
        } catch (error) {
            console.error('Erreur mise à jour poule:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/poules/:id/classement
     */
    async updateClassement(req, res) {
        try {
            const poule_id = +req.params.id;
            const { classement } = req.body;

            if (!Array.isArray(classement)) {
                return res.status(400).json({ error: 'Classement doit être un tableau' });
            }

            const updates = { classement };
            await dataService.updateClassementPoule(poule_id, classement);
            const poule = await dataService.getPouleById(poule_id);

            if (!poule) {
                return res.status(404).json({ error: 'Poule non trouvée' });
            }

            dataService.addLog(`Classement de poule mis à jour: ${poule.nom}`, {
                poule_id,
                nb_equipes: classement.length
            });

            res.json({ success: true });
        } catch (error) {
            console.error('Erreur mise à jour classement:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * DELETE /api/poules - Reset de toutes les poules
     */
    async deleteAll(req, res) {
        try {
            await dataService.deleteAllPoules();
            dataService.addLog('Toutes les poules ont été supprimées');

            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression poules:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/classement/poule/:id
     */
    async getClassementPoule(req, res) {
        try {
            const poule_id = +req.params.id;
            const classementService = require('../services/classementService');

            const poule = await classementService.calculerClassementPoule(poule_id);
            if (!poule) {
                return res.status(404).json({ error: 'Poule non trouvée' });
            }

            res.json(poule);
        } catch (error) {
            console.error('Erreur classement poule:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/classement/general
     */
    async getClassementGeneral(req, res) {
        console.log('🔥 getClassementGeneral appelée !');
        try {
            console.log('🔍 Chargement du service...');
            const classementService = require('../services/classementService');

            console.log('📊 Calcul du classement...');
            const classement = await classementService.calculerClassementGeneral();

            console.log('✅ Classement calculé:', classement.length, 'équipes');
            console.log('📋 Premier élément:', JSON.stringify(classement[0], null, 2));

            res.json(classement);
        } catch (error) {
            console.error('❌ ERREUR classement général:', error.message);
            console.error('📍 Stack:', error.stack);
            res.status(500).json({ error: 'Erreur serveur', details: error.message });
        }
    }

    /**
     * GET /api/confrontations/en-cours
     */
    async getConfrontationsEnCours(req, res) {
        try {
            const tatamis = await dataService.getAllTatamis();
            const combats = await dataService.getAllCombats();

            const en_cours = tatamis.flatMap(tatami => {
                if (!tatami.combats_ids || tatami.combats_ids.length === 0) {
                    return [];
                }

                const index = tatami.index_combat_actuel ?? 0;
                const combat_id = tatami.combats_ids[index];
                const combat_actuel = combats.find(c => c.id === combat_id);

                if (!combat_actuel || !['en cours', 'prévu'].includes(combat_actuel.etat)) {
                    return [];
                }

                return [{
                    tatami: tatami.nom || `Tatami ${tatami.id}`,
                    equipe_rouge_id: combat_actuel.rouge?.equipe_id || combat_actuel.rouge?.id,
                    equipe_bleu_id: combat_actuel.bleu?.equipe_id || combat_actuel.bleu?.id,
                    equipe_rouge_nom: combat_actuel.rouge?.equipe || combat_actuel.rouge?.nom || 'Rouge',
                    equipe_bleu_nom: combat_actuel.bleu?.equipe || combat_actuel.bleu?.nom || 'Bleu',
                    combat_id: combat_actuel.id,
                    etat: combat_actuel.etat
                }];
            });

            res.json(en_cours);
        } catch (error) {
            console.error('Erreur confrontations en cours:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/poules/assign-combat - Assigner un combat à partir d'une rencontre
     */
    async assignCombat(req, res) {
        try {
            const { rencontre_id, tatami_id } = req.body;

            if (!rencontre_id || !tatami_id) {
                return res.status(400).json({ error: 'rencontre_id et tatami_id requis' });
            }

            // Utiliser combatService pour générer les combats
            const combatService = require('../services/combatService');
            const tatamiService = require('../services/tatamiService');

            // Trouver la rencontre
            const poules = await dataService.getAllPoules();
            let rencontre = null;

            for (const poule of poules) {
                rencontre = poule.rencontres.find(r => r.id == rencontre_id);
                if (rencontre) break;
            }

            if (!rencontre) {
                return res.status(404).json({ error: 'Rencontre introuvable' });
            }

            // Générer les combats entre les équipes
            const combats = await combatService.genererCombatsEquipes(
                rencontre.equipe_a,
                rencontre.equipe_b
            );

            if (combats.length === 0) {
                return res.status(400).json({ error: 'Aucun combat valide généré' });
            }

            const combats_ids = combats.map(c => c.id);

            // Assigner au tatami
            const result = await tatamiService.assignerCombats(tatami_id, combats_ids);
            if (!result.success) {
                return res.status(400).json(result);
            }

            // Mettre à jour la rencontre
            rencontre.combats_ids = combats_ids;
            rencontre.etat = 'assignee';
            await dataService.createPoules(poules);

            res.locals.tatami = result.tatami;
            res.json({
                success: true,
                combats_crees: combats.length,
                rencontre,
                tatami: result.tatami
            });

        } catch (error) {
            console.error('Erreur assignation combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}

module.exports = new PoulesController();