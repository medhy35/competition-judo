// src/controllers/combats.js
const dataService = require('../services/databaseAdapter');
const configService = require('../services/configService');

class CombatsController {
    /**
     * GET /api/combats
     */
    async getAll(req, res) {
        try {
            const combats = await dataService.getAllCombats();
            const combatService = require('../services/combatService');
            const combats_enrichis = await Promise.all(
                combats.map(c => combatService.enrichCombatAsync(c))
            );
            res.json(combats_enrichis);
        } catch (error) {
            console.error('Erreur récupération combats:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * GET /api/combats/:id
     */
    async getById(req, res) {
        try {
            const combat_id = +req.params.id;
            const combat = await dataService.getCombatById(combat_id);

            if (!combat) {
                return res.status(404).json({ error: 'Combat introuvable' });
            }

            const combatService = require('../services/combatService');
            res.json(await combatService.enrichCombatAsync(combat));
        } catch (error) {
            console.error('Erreur récupération combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * POST /api/combats
     */
    async create(req, res) {
        try {
            const { rouge, bleu, timer } = req.body;

            if (!rouge || !bleu) {
                return res.status(400).json({ error: 'Combattants rouge et bleu requis' });
            }

            const new_combat = {
                rouge,
                bleu,
                etat: 'prévu',
                rouge_ippon: 0,        // ⚠️ Changé de ipponRouge
                bleu_ippon: 0,         // ⚠️ Changé de ipponBleu
                rouge_wazari: 0,       // ⚠️ Changé de wazariRouge
                bleu_wazari: 0,        // ⚠️ Changé de wazariBleu
                rouge_yuko: 0,         // ⚠️ Changé de yukoRouge
                bleu_yuko: 0,          // ⚠️ Changé de yukoBleu
                rouge_shido: 0,        // ⚠️ Changé de penalitesRouge
                bleu_shido: 0,         // ⚠️ Changé de penalitesBleu
                temps_ecoule: timer ?? configService.get('combat.dureeParDefaut', 240), // ⚠️ Changé de timer
                date_creation: new Date().toISOString() // ⚠️ Changé de dateCreation
            };

            const combat = await dataService.createCombat(new_combat);

            const combatService = require('../services/combatService');
            const combat_enrichi = await combatService.enrichCombatAsync(combat);

            dataService.addLog('Nouveau combat créé', {
                combat_id: combat.id,
                rouge: rouge.nom || rouge.id,
                bleu: bleu.nom || bleu.id
            });

            res.locals.combat = combat_enrichi;
            res.status(201).json(combat_enrichi);
        } catch (error) {
            console.error('Erreur création combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * PATCH /api/combats/:id - Version améliorée avec actions spéciales
     */
    async update(req, res) {
        try {
            const combat_id = +req.params.id;
            const updates = req.body;
            const combatService = require('../services/combatService');

            // Récupérer le combat actuel
            let combat = await dataService.getCombatById(combat_id);
            if (!combat) {
                return res.status(404).json({ error: 'Combat introuvable' });
            }

            // Traiter les actions spéciales
            if (updates.action) {
                const result = await this._handleSpecialAction(combat, updates);
                if (result.error) {
                    return res.status(400).json({ error: result.error });
                }

                combat = result.combat;
                res.locals.combat = combat;

                if (result.additionalData) {
                    return res.json({
                        combat,
                        ...result.additionalData
                    });
                }

                return res.json(combat);
            }

            // Mise à jour normale
            combat = await dataService.updateCombat(combat_id, updates);

            // Vérification automatique de fin de combat
            const raison_fin = combatService.verifierFinCombat(combat);
            if (raison_fin && combat.etat !== 'terminé') {
                const combat_temp = { ...combat, etat: 'terminé' };
                const vainqueur = combatService.determinerVainqueur(combat_temp);
                const final_updates = {
                    etat: 'terminé',
                    date_fin: new Date().toISOString(),
                    raison_fin: raison_fin,
                    vainqueur
                };

                combat = await dataService.updateCombat(combat_id, final_updates);

                // Mettre à jour les classements
                const classementService = require('../services/classementService');
                classementService.mettreAJourClassements(combat);

                dataService.addLog('Combat terminé automatiquement', {
                    combat_id: combat.id,
                    raison_fin: raison_fin,
                    vainqueur
                });
            }

            // Enrichir le combat avant de le retourner
            const combat_enrichi = await combatService.enrichCombatAsync(combat);
            res.locals.combat = combat_enrichi;
            res.json(combat_enrichi);

        } catch (error) {
            console.error('Erreur mise à jour combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    /**
     * Gère les actions spéciales sur un combat
     * @private
     */
    async _handleSpecialAction(combat, updates) {
        const combatService = require('../services/combatService');

        switch (updates.action) {
            case 'marquer_point':
                return await this._handleMarquerPoint(combat, updates);

            case 'start_osaekomi':
                return await this._handleStartOsaekomi(combat, updates);

            case 'stop_osaekomi':
                return await this._handleStopOsaekomi(combat, updates);

            case 'correction':
                return await this._handleCorrection(combat, updates);

            case 'reset':
                return await this._handleReset(combat);

            default:
                return { error: 'Action non reconnue' };
        }
    }

    /**
     * Marquer un point
     * @private
     */
    async _handleMarquerPoint(combat, { cote, type }) {
        if (!cote || !type) {
            return { error: 'Côté et type requis' };
        }

        if (combat.etat === 'terminé') {
            return { error: 'Combat déjà terminé' };
        }

        const combatService = require('../services/combatService');

        try {
            // Utiliser la méthode du service pour marquer le point
            const combat_mis_a_jour = combatService.marquerPoint(combat, cote, type);

            // Sauvegarder
            const saved_combat = await dataService.updateCombat(combat.id, combat_mis_a_jour);

            // Mettre à jour les classements si combat terminé
            if (saved_combat.etat === 'terminé') {
                const classementService = require('../services/classementService');
                classementService.mettreAJourClassements(saved_combat);
            }

            dataService.addLog(`Point marqué: ${type} ${cote}`, {
                combat_id: combat.id,
                type,
                cote,
                combat_termine: saved_combat.etat === 'terminé'
            });

            return {
                combat: await combatService.enrichCombatAsync(saved_combat)
            };

        } catch (error) {
            return { error: error.message || 'Erreur lors du marquage du point' };
        }
    }

    /**
     * Démarrer un osaekomi
     * @private
     */
    async _handleStartOsaekomi(combat, { cote }) {
        if (!cote) {
            return { error: 'Côté requis pour osaekomi' };
        }

        if (combat.etat !== 'en cours') {
            return { error: 'Combat doit être en cours pour osaekomi' };
        }

        // Arrêter un osaekomi en cours s'il y en a un
        const updates = {
            osaekomi_actif: true,          // ⚠️ Changé de osaekomoActif
            osaekomi_cote: cote,           // ⚠️ Changé de osaekomoCote
            osaekomi_debut: new Date().toISOString()  // ⚠️ Changé de osaekomoDebut
        };

        const combat_mis_a_jour = await dataService.updateCombat(combat.id, updates);
        const combatService = require('../services/combatService');

        dataService.addLog(`Osaekomi démarré: ${cote}`, {
            combat_id: combat.id,
            cote
        });

        return {
            combat: await combatService.enrichCombatAsync(combat_mis_a_jour)
        };
    }

    /**
     * Arrêter un osaekomi
     * @private
     */
    /**
     * Arrêter un osaekomi
     * @private
     */
    async _handleStopOsaekomi(combat, { duree }) {
        // ⚠️ CORRECTION : Recharger le combat depuis la DB pour avoir l'état réel
        const combat_actuel = await dataService.getCombatById(combat.id);

        if (!combat_actuel.osaekomi_actif) {
            return { error: 'Aucun osaekomi en cours' };
        }

        const combatService = require('../services/combatService');
        const duree_effective = duree || 0;

        try {
            // Traiter l'osaekomi avec le service
            const result = combatService.traiterOsaekomi(
                duree_effective,
                combat_actuel,
                combat_actuel.osaekomi_cote
            );

            // Nettoyer les données osaekomi
            const cleanup_updates = {
                ...result.combat,
                osaekomi_actif: false,
                osaekomi_cote: null,
                osaekomi_debut: null
            };

            const combat_mis_a_jour = await dataService.updateCombat(combat.id, cleanup_updates);

            // Mettre à jour les classements si combat terminé
            if (result.fin_combat) {
                const classementService = require('../services/classementService');
                await classementService.mettreAJourClassements(combat_mis_a_jour);
            }

            await dataService.addLog('Osaekomi arrêté', {
                combat_id: combat.id,
                duree: duree_effective,
                points_marques: result.points_marques,
                fin_combat: result.fin_combat
            });

            return {
                combat: await combatService.enrichCombatAsync(combat_mis_a_jour),
                additionalData: {
                    points_marques: result.points_marques,
                    fin_combat: result.fin_combat,
                    duree: duree_effective
                }
            };

        } catch (error) {
            return { error: error.message || 'Erreur lors de l\'arrêt osaekomi' };
        }
    }

    /**
     * Gérer une correction de score
     * @private
     */
    async _handleCorrection(combat, { cote, operation, type, from, to }) {
        if (!cote || !operation) {
            return { error: 'Côté et opération requis pour correction' };
        }

        const couleur = cote.charAt(0).toUpperCase() + cote.slice(1);
        const updates = {};

        try {
            switch (operation) {
                case 'retirer':
                    if (!type) return { error: 'Type requis pour retrait' };

                    switch (type) {
                        case 'ippon':
                            if (combat[`${cote}_ippon`]) {
                                updates[`${cote}_ippon`] = 0;
                            }
                            break;
                        case 'wazari':
                            const wazari = combat[`${cote}_wazari`] || 0;  // ⚠️ Changé
                            if (wazari > 0) {
                                updates[`${cote}_wazari`] = wazari - 1;
                            }
                            break;
                        case 'yuko':
                            const yuko = combat[`${cote}_yuko`] || 0;  // ⚠️ Changé
                            if (yuko > 0) {
                                updates[`${cote}_yuko`] = yuko - 1;
                            }
                            break;
                        case 'shido':
                            const shido = combat[`${cote}_shido`] || 0;  // ⚠️ Changé
                            if (shido > 0) {
                                updates[`${cote}_shido`] = shido - 1;
                            }
                            break;
                    }
                    break;

                case 'convertir':
                    if (!from || !to) return { error: 'Types source et destination requis' };

                    if (from === 'ippon' && combat[`${cote}_ippon`]) {
                        updates[`${cote}_ippon`] = 0;
                        if (to === 'wazari') {
                            updates[`${cote}_wazari`] = (combat[`${cote}_wazari`] || 0) + 1;
                        } else if (to === 'yuko') {
                            updates[`${cote}_yuko`] = (combat[`${cote}_yuko`] || 0) + 1;
                        }
                    } else if (from === 'wazari' && (combat[`${cote}_wazari`] || 0) > 0) {
                        updates[`${cote}_wazari`] = combat[`${cote}_wazari`] - 1;
                        if (to === 'yuko') {
                            updates[`${cote}_yuko`] = (combat[`${cote}_yuko`] || 0) + 1;
                        }
                    }
                    break;

                case 'raz':
                    updates[`${cote}_ippon`] = 0;      // ⚠️ Changé
                    updates[`${cote}_wazari`] = 0;     // ⚠️ Changé
                    updates[`${cote}_yuko`] = 0;       // ⚠️ Changé
                    updates[`${cote}_shido`] = 0;      // ⚠️ Changé
                    break;
            }

            // Si le combat était terminé, le remettre en état pour permettre les corrections
            if (combat.etat === 'terminé') {
                updates.etat = 'pause';
                updates.date_fin = null;     // ⚠️ Changé de dateFin
                updates.raison_fin = null;
                updates.vainqueur = null;
            }

            const combat_mis_a_jour = await dataService.updateCombat(combat.id, updates);
            const combatService = require('../services/combatService');

            dataService.addLog(`Correction appliquée: ${operation}`, {
                combat_id: combat.id,
                cote,
                operation,
                type,
                from,
                to
            });

            return {
                combat: await combatService.enrichCombatAsync(combat_mis_a_jour)
            };

        } catch (error) {
            return { error: error.message || 'Erreur lors de la correction' };
        }
    }

    /**
     * Remettre à zéro un combat
     * @private
     */
    async _handleReset(combat) {
        const reset_updates = {
            etat: 'prévu',
            temps_ecoule: 240,       // ⚠️ Changé de timer
            rouge_ippon: 0,          // ⚠️ Changé
            bleu_ippon: 0,           // ⚠️ Changé
            rouge_wazari: 0,         // ⚠️ Changé
            bleu_wazari: 0,          // ⚠️ Changé
            rouge_yuko: 0,           // ⚠️ Changé
            bleu_yuko: 0,            // ⚠️ Changé
            rouge_shido: 0,          // ⚠️ Changé
            bleu_shido: 0,           // ⚠️ Changé
            date_fin: null,          // ⚠️ Changé
            raison_fin: null,        // ⚠️ Changé
            vainqueur: null,
            osaekomi_actif: false,   // ⚠️ Changé
            osaekomi_cote: null,     // ⚠️ Changé
            osaekomi_debut: null
        };

        const combat_reset = await dataService.updateCombat(combat.id, reset_updates);
        const combatService = require('../services/combatService');

        dataService.addLog('Combat remis à zéro', {
            combat_id: combat.id
        });

        return {
            combat: await combatService.enrichCombatAsync(combat_reset)
        };
    }

    /**
     * DELETE /api/combats/:id
     */
    async delete(req, res) {
        try {
            const combat_id = +req.params.id;
            const deleted = await dataService.deleteCombat(combat_id);

            if (!deleted) {
                return res.status(404).json({ error: 'Combat introuvable' });
            }

            dataService.addLog('Combat supprimé', { combat_id });
            res.json({ success: true });
        } catch (error) {
            console.error('Erreur suppression combat:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}

module.exports = new CombatsController();