// src/services/postgresService.js
const { Pool } = require('pg');
const configService = require('./configService');
const dotenv = require('dotenv');
dotenv.config();

class PostgresService {
    constructor() {
        this.pool = null;
        this.isConnected = false;
    }

    /**
     * Initialise la connexion à PostgreSQL
     * @param {Object} config - Configuration de connexion
     */
    async init(config = {}) {
        const dbConfig = {
            host: config.host || process.env.DB_HOST || 'localhost',
            port: config.port || process.env.DB_PORT || 5432,
            database: config.database || process.env.DB_NAME || 'judo_tournament',
            user: config.user || process.env.DB_USER || 'postgres',
            password: config.password || process.env.DB_PASSWORD || '',
            max: config.max || 20, // Nombre max de connexions dans le pool
            idleTimeoutMillis: config.idleTimeoutMillis || 30000,
            connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
        };

        this.pool = new Pool(dbConfig);

        // Gestionnaire d'erreur
        this.pool.on('error', (err) => {
            console.error('Erreur PostgreSQL inattendue:', err);
        });

        try {
            // Test de connexion
            const client = await this.pool.connect();
            console.log('✅ Connexion PostgreSQL établie');
            client.release();
            this.isConnected = true;
            return { success: true };
        } catch (error) {
            console.error('❌ Erreur connexion PostgreSQL:', error.message);
            this.isConnected = false;
            return { success: false, error: error.message };
        }
    }

    /**
     * Exécute une requête SQL
     * @param {string} query - Requête SQL
     * @param {Array} params - Paramètres de la requête
     */
    async query(query, params = []) {
        if (!this.isConnected) {
            throw new Error('Base de données non connectée');
        }

        try {
            const result = await this.pool.query(query, params);
            return result;
        } catch (error) {
            console.error('Erreur requête SQL:', error.message);
            console.error('Query:', query);
            console.error('Params:', params);
            throw error;
        }
    }

    /**
     * Démarre une transaction
     */
    async beginTransaction() {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return client;
    }

    /**
     * Commit une transaction
     */
    async commitTransaction(client) {
        await client.query('COMMIT');
        client.release();
    }

    /**
     * Rollback une transaction
     */
    async rollbackTransaction(client) {
        await client.query('ROLLBACK');
        client.release();
    }

    // =============================================
    // MÉTHODES ÉQUIPES
    // =============================================

    async getAllEquipes() {
        const result = await this.query('SELECT * FROM equipes ORDER BY nom');
        return result.rows;
    }

    async getEquipeById(id) {
        const result = await this.query('SELECT * FROM equipes WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    async createEquipe(equipe) {
        const { id, nom, couleur } = equipe;
        const result = await this.query(
            `INSERT INTO equipes (id, nom, couleur, victoires, points, score_global)
             VALUES ($1, $2, $3, 0, 0, 0)
             RETURNING *`,
            [id, nom, couleur || 'primary']
        );
        return result.rows[0];
    }

    async updateEquipe(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
            fields.push(`${this.camelToSnake(key)} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        });

        if (fields.length === 0) return null;

        values.push(id);
        const result = await this.query(
            `UPDATE equipes SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    }

    async deleteEquipe(id) {
        const result = await this.query('DELETE FROM equipes WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    // =============================================
    // MÉTHODES COMBATTANTS
    // =============================================

    async getAllCombattants() {
        const result = await this.query(`
            SELECT c.*, e.nom as equipe_nom, e.couleur as equipe_couleur
            FROM combattants c
            LEFT JOIN equipes e ON c.equipe_id = e.id
            ORDER BY c.nom
        `);
        return result.rows;
    }

    async getCombattantById(id) {
        const result = await this.query(`
            SELECT c.*, e.nom as equipe_nom, e.couleur as equipe_couleur
            FROM combattants c
            LEFT JOIN equipes e ON c.equipe_id = e.id
            WHERE c.id = $1
        `, [id]);
        return result.rows[0] || null;
    }

    async createCombattant(combattant) {
        const { nom, sexe, poids, equipe_id } = combattant;
        const result = await this.query(
            `INSERT INTO combattants (nom, sexe, poids, equipe_id)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [nom, sexe, poids, equipe_id]
        );
        return result.rows[0];
    }

    async updateCombattant(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
            fields.push(`${this.camelToSnake(key)} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        });

        if (fields.length === 0) return null;

        values.push(id);
        const result = await this.query(
            `UPDATE combattants SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        return result.rows[0] || null;
    }

    async deleteCombattant(id) {
        const result = await this.query('DELETE FROM combattants WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    async getCombattantsByEquipe(equipe_id) {
        const result = await this.query(
            'SELECT * FROM combattants WHERE equipe_id = $1 ORDER BY nom',
            [equipe_id]
        );
        return result.rows;
    }

    async getCombattantsByCategorie(sexe, poids) {
        let query = 'SELECT c.*, e.nom as equipe_nom FROM combattants c LEFT JOIN equipes e ON c.equipe_id = e.id WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (sexe) {
            query += ` AND c.sexe = $${paramIndex}`;
            params.push(sexe);
            paramIndex++;
        }

        if (poids) {
            query += ` AND c.poids = $${paramIndex}`;
            params.push(poids);
        }

        query += ' ORDER BY c.nom';
        const result = await this.query(query, params);
        return result.rows;
    }

    // =============================================
    // MÉTHODES TATAMIS
    // =============================================

    async getAllTatamis() {
        const result = await this.query('SELECT * FROM tatamis ORDER BY id');

        // Récupérer les combats assignés pour chaque tatami
        for (let tatami of result.rows) {
            const combatsResult = await this.query(
                `SELECT combat_id FROM tatamis_combats
                 WHERE tatami_id = $1 ORDER BY ordre`,
                [tatami.id]
            );
            tatami.combats_ids = combatsResult.rows.map(r => r.combat_id);

            // Récupérer l'historique
            const historiqueResult = await this.query(
                `SELECT timestamp, action, donnees, ancien_index, nouveau_index
                 FROM historique_tatamis 
                 WHERE tatami_id = $1 ORDER BY timestamp DESC LIMIT 50`,
                [tatami.id]
            );
            tatami.historique = historiqueResult.rows;

            // Scores déjà en snake_case
        }

        return result.rows;
    }

    async getTatamiById(id) {
        const result = await this.query('SELECT * FROM tatamis WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;

        const tatami = result.rows[0];

        // Récupérer les combats assignés
        const combatsResult = await this.query(
            `SELECT combat_id FROM tatamis_combats
             WHERE tatami_id = $1 ORDER BY ordre`,
            [id]
        );
        tatami.combats_ids = combatsResult.rows.map(r => r.combat_id);

        // Récupérer l'historique
        const historiqueResult = await this.query(
            `SELECT timestamp, action, donnees FROM historique_tatamis 
             WHERE tatami_id = $1 ORDER BY timestamp DESC LIMIT 50`,
            [id]
        );
        tatami.historique = historiqueResult.rows;

        return tatami;
    }

    async createTatami(tatami) {
        const { nom, etat } = tatami;
        const result = await this.query(
            `INSERT INTO tatamis (nom, etat, index_combat_actuel, score_rouge, score_bleu)
             VALUES ($1, $2, 0, 0, 0)
             RETURNING *`,
            [nom || 'Tatami', etat || 'libre']
        );

        const newTatami = result.rows[0];
        newTatami.combats_ids = [];
        newTatami.historique = [];

        return newTatami;
    }

    async updateTatami(id, updates) {
        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'combats_ids' && key !== 'historique') {
                const columnName = key.includes('_') ? key : this.camelToSnake(key);
                fields.push(`${columnName} = $${paramIndex}`);
                values.push(value);
                paramIndex++;
            }
        });

        if (fields.length > 0) {
            values.push(id);
            await this.query(
                `UPDATE tatamis SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
                values
            );
        }

        // Gérer combats_ids séparément si présent
        if (updates.combats_ids) {
            await this.assignCombatsToTatami(id, updates.combats_ids);
        }

        // Ajouter à l'historique si présent
        if (updates.historique && Array.isArray(updates.historique)) {
            const lastEntry = updates.historique[updates.historique.length - 1];
            if (lastEntry) {
                await this.addTatamiHistorique(id, lastEntry);
            }
        }

        return await this.getTatamiById(id);
    }

    async deleteTatami(id) {
        const result = await this.query('DELETE FROM tatamis WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    async assignCombatsToTatami(tatami_id, combats_ids) {
        // Supprimer les anciens combats
        await this.query('DELETE FROM tatamis_combats WHERE tatami_id = $1', [tatami_id]);

        // Ajouter les nouveaux combats
        for (let i = 0; i < combats_ids.length; i++) {
            await this.query(
                `INSERT INTO tatamis_combats (tatami_id, combat_id, ordre)
                 VALUES ($1, $2, $3)`,
                [tatami_id, combats_ids[i], i]
            );
        }
    }

    async addTatamiHistorique(tatami_id, entry) {
        await this.query(
            `INSERT INTO historique_tatamis (tatami_id, timestamp, action, donnees, ancien_index, nouveau_index)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                tatami_id,
                entry.timestamp || new Date().toISOString(),
                entry.action,
                JSON.stringify(entry.donnees || entry),
                entry.ancien_index || null,
                entry.nouveau_index || null
            ]
        );
    }

    // =============================================
    // MÉTHODES COMBATS
    // =============================================

    async getAllCombats() {
        const result = await this.query('SELECT * FROM combats ORDER BY date_creation DESC');
        return result.rows.map(this.formatCombat);
    }

    async getCombatById(id) {
        const result = await this.query('SELECT * FROM combats WHERE id = $1', [id]);
        return result.rows[0] ? this.formatCombat(result.rows[0]) : null;
    }

    async createCombat(combat) {
        const result = await this.query(
            `INSERT INTO combats (
                id, tatami_id,
                rouge_id, rouge_nom, rouge_equipe_id, rouge_equipe_nom,
                bleu_id, bleu_nom, bleu_equipe_id, bleu_equipe_nom,
                etat, categorie, duree_combat
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *`,
            [
                combat.id || Date.now(),
                combat.tatami_id || null,
                combat.rouge_id || null,
                combat.rouge_nom || null,
                combat.rouge_equipe_id || null,
                combat.rouge_equipe_nom || null,
                combat.bleu_id || null,
                combat.bleu_nom || null,
                combat.bleu_equipe_id || null,
                combat.bleu_equipe_nom || null,
                combat.etat || 'prévu',
                combat.categorie || null,
                combat.duree_combat || 300
            ]
        );
        return this.formatCombat(result.rows[0]);
    }

    async updateCombat(id, updates) {
        // Toutes les clés doivent déjà être en snake_case
        const fields = [];
        const values = [];
        let paramIndex = 1;

        Object.entries(updates).forEach(([key, value]) => {
            // S'assurer que la clé est en snake_case
            const columnName = key.includes('_') ? key : this.camelToSnake(key);
            fields.push(`${columnName} = $${paramIndex}`);
            values.push(value);
            paramIndex++;
        });

        if (fields.length === 0) return null;

        values.push(id);
        const result = await this.query(
            `UPDATE combats SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            values
        );
        console.log('✅ Combat après UPDATE:', result.rows[0]);
        return result.rows[0] ? this.formatCombat(result.rows[0]) : null;
    }

    async deleteCombat(id) {
        const result = await this.query('DELETE FROM combats WHERE id = $1 RETURNING *', [id]);
        return result.rowCount > 0;
    }

    /**
     * Formate un combat de la DB vers le format snake_case
     */
    formatCombat(dbCombat) {

        if (!dbCombat) return null;

        return {
            id: dbCombat.id,
            tatami_id: dbCombat.tatami_id,
            rouge_id: dbCombat.rouge_id,
            rouge_nom: dbCombat.rouge_nom,
            rouge_equipe_id: dbCombat.rouge_equipe_id,
            rouge_equipe_nom: dbCombat.rouge_equipe_nom,
            rouge_ippon: dbCombat.rouge_ippon || 0,
            rouge_wazari: dbCombat.rouge_wazari || 0,
            rouge_yuko: dbCombat.rouge_yuko || 0,
            rouge_shido: dbCombat.rouge_shido || 0,
            rouge_points: dbCombat.rouge_points || 0,
            bleu_id: dbCombat.bleu_id,
            bleu_nom: dbCombat.bleu_nom,
            bleu_equipe_id: dbCombat.bleu_equipe_id,
            bleu_equipe_nom: dbCombat.bleu_equipe_nom,
            bleu_ippon: dbCombat.bleu_ippon || 0,
            bleu_wazari: dbCombat.bleu_wazari || 0,
            bleu_yuko: dbCombat.bleu_yuko || 0,
            bleu_shido: dbCombat.bleu_shido || 0,
            bleu_points: dbCombat.bleu_points || 0,
            etat: dbCombat.etat,
            vainqueur: dbCombat.vainqueur,
            duree_combat: dbCombat.duree_combat,
            temps_ecoule: dbCombat.temps_ecoule,
            date_creation: dbCombat.date_creation,
            date_debut: dbCombat.date_debut,
            date_fin: dbCombat.date_fin,
            osaekomi_actif: dbCombat.osaekomi_actif,
            osaekomi_cote: dbCombat.osaekomi_cote,
            osaekomi_debut: dbCombat.osaekomi_debut,
            categorie: dbCombat.categorie,
            raison_fin: dbCombat.raison_fin
        };
    }

    // =============================================
    // MÉTHODES POULES
    // =============================================

    async getAllPoules() {
        const result = await this.query('SELECT * FROM poules ORDER BY id');

        for (let poule of result.rows) {
            // Récupérer les équipes de la poule
            const equipesResult = await this.query(
                'SELECT equipe_id FROM poules_equipes WHERE poule_id = $1',
                [poule.id]
            );
            poule.equipes_ids = equipesResult.rows.map(r => r.equipe_id);

            // Récupérer les rencontres
            const rencontresResult = await this.query(
                `SELECT r.*, 
                 ARRAY(SELECT combat_id FROM rencontres_combats WHERE rencontre_id = r.id) as combats_ids
                 FROM rencontres r WHERE poule_id = $1`,
                [poule.id]
            );
            poule.rencontres = rencontresResult.rows.map(r => ({
                id: r.id,
                equipe_a_id: r.equipe_a_id,
                equipe_b_id: r.equipe_b_id,
                combats_ids: r.combats_ids || [],
                resultat: r.resultat,
                etat: r.etat
            }));

            // Récupérer le classement
            const classementResult = await this.query(
                `SELECT * FROM classements_poules 
                 WHERE poule_id = $1 ORDER BY points DESC, differentiel DESC`,
                [poule.id]
            );
            poule.classement = classementResult.rows;
        }

        return result.rows;
    }

    async getPouleById(id) {
        const result = await this.query('SELECT * FROM poules WHERE id = $1', [id]);
        if (result.rows.length === 0) return null;

        const poule = result.rows[0];

        // Récupérer les équipes
        const equipesResult = await this.query(
            'SELECT equipe_id FROM poules_equipes WHERE poule_id = $1',
            [id]
        );
        poule.equipes_ids = equipesResult.rows.map(r => r.equipe_id);

        // Récupérer les rencontres
        const rencontresResult = await this.query(
            'SELECT * FROM rencontres WHERE poule_id = $1',
            [id]
        );
        poule.rencontres = rencontresResult.rows;

        // Récupérer le classement
        const classementResult = await this.query(
            'SELECT * FROM classements_poules WHERE poule_id = $1 ORDER BY points DESC',
            [id]
        );
        poule.classement = classementResult.rows;

        return poule;
    }

    async createPoules(poules_data) {
        const created_poules = [];

        for (let poule_data of poules_data) {
            // Créer la poule
            const poule_result = await this.query(
                'INSERT INTO poules (nom) VALUES ($1) RETURNING *',
                [poule_data.nom]
            );
            const poule = poule_result.rows[0];

            // Ajouter les équipes
            for (let equipe_id of poule_data.equipes_ids) {
                await this.query(
                    'INSERT INTO poules_equipes (poule_id, equipe_id) VALUES ($1, $2)',
                    [poule.id, equipe_id]
                );

                // Créer l'entrée de classement
                await this.query(
                    `INSERT INTO classements_poules (poule_id, equipe_id)
                     VALUES ($1, $2)`,
                    [poule.id, equipe_id]
                );
            }

            // Créer les rencontres
            for (let rencontre of poule_data.rencontres) {
                await this.query(
                    `INSERT INTO rencontres (id, poule_id, equipe_a_id, equipe_b_id, etat)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [rencontre.id, poule.id, rencontre.equipe_a_id, rencontre.equipe_b_id, 'prevue']
                );
            }

            poule.equipes_ids = poule_data.equipes_ids;
            poule.rencontres = poule_data.rencontres;
            created_poules.push(poule);
        }

        return created_poules;
    }

    async deleteAllPoules() {
        await this.query('DELETE FROM poules');
        return true;
    }

    async updateClassementPoule(poule_id, classement) {
        for (let entry of classement) {
            await this.query(
                `UPDATE classements_poules
                 SET points = $1, victoires = $2, defaites = $3, egalites = $4,
                     confrontations_jouees = $5, points_marques = $6, points_encaisses = $7, differentiel = $8
                 WHERE poule_id = $9 AND equipe_id = $10`,
                [
                    entry.points || 0,
                    entry.victoires || 0,
                    entry.defaites || 0,
                    entry.egalites || 0,
                    entry.confrontations_jouees || 0,
                    entry.points_marques || 0,
                    entry.points_encaisses || 0,
                    entry.differentiel || 0,
                    poule_id,
                    entry.equipe_id
                ]
            );
        }

        // Mettre à jour le timestamp de la poule
        await this.query(
            'UPDATE poules SET derniere_mise_a_jour = CURRENT_TIMESTAMP WHERE id = $1',
            [poule_id]
        );

        return true;
    }

    // =============================================
    // MÉTHODES LOGS
    // =============================================

    async addLog(message, data = {}) {
        await this.query(
            'INSERT INTO logs (message, donnees) VALUES ($1, $2)',
            [message, JSON.stringify(data)]
        );
        console.log('[LOG]', message, data);
    }

    async getAllLogs(limit = 100) {
        const result = await this.query(
            'SELECT * FROM logs ORDER BY timestamp DESC LIMIT $1',
            [limit]
        );
        return result.rows;
    }

    async cleanOldLogs(days = 30) {
        const result = await this.query(
            `DELETE FROM logs WHERE timestamp < CURRENT_TIMESTAMP - INTERVAL '${days} days'`
        );
        return result.rowCount;
    }

    // =============================================
    // UTILITAIRES
    // =============================================

    /**
     * Convertit camelCase en snake_case
     */
    camelToSnake(str) {
        // Si déjà en snake_case, ne rien faire
        if (str.includes('_')) {
            return str;
        }
        // Sinon convertir camelCase → snake_case
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }

    /**
     * Génère un ID unique
     */
    generateId() {
        return Date.now() + Math.floor(Math.random() * 1000);
    }

    /**
     * Export de toutes les données (pour backup)
     */
    async exportAll() {
        const data = {
            equipes: await this.getAllEquipes(),
            combattants: await this.getAllCombattants(),
            tatamis: await this.getAllTatamis(),
            combats: await this.getAllCombats(),
            poules: await this.getAllPoules(),
            logs: await this.getAllLogs(1000)
        };
        return data;
    }

    /**
     * Ferme la connexion
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            this.isConnected = false;
            console.log('Connexion PostgreSQL fermée');
        }
    }
}

module.exports = new PostgresService();