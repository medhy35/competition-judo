// server.js
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const { Server } = require('socket.io');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);
const PORT   = 3000;

// --- Middlewares ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Fichiers de données ---
const tatamisFile     = path.join(__dirname, 'data', 'tatamis.json');
const equipesFile     = path.join(__dirname, 'data', 'equipes.json');
const combattantsFile = path.join(__dirname, 'data', 'combattants.json');
const combatsFile     = path.join(__dirname, 'data', 'combats.json');
const configFile      = path.join(__dirname, 'data', 'config.json');
const poulesFile = path.join(__dirname, 'data', 'poules.json');
const tableauFile = path.join(__dirname, 'data', 'tableau.json');
const logsFile = path.join(__dirname, 'data', 'logs.json');


// --- Utilitaires de lecture/écriture ---
function lireJSON(file) {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
function ecrireJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// --- Socket.io ---
io.on('connection', socket => {
    console.log('→ Client connecté via WebSocket');
    // --- Événements Osaekomi ---
    socket.on('osaekomi:update', (data) => {
        // data = { tatamiId, osaekomiCounter, osaekomiCote }
        io.emit('osaekomi:update', data); // broadcast vers tous
    });

    socket.on('osaekomi:stop', (data) => {
        // data = { tatamiId }
        io.emit('osaekomi:stop', data); // broadcast vers tous
    });
});
io.on('connection', (socket) => {
    socket.on('combats:update', (data) => {
        // On renvoie à tous les autres clients (public + autres tables)
        socket.broadcast.emit('combats:update', data);
    });
});
// Helper pour émettre un update
function broadcast(ressource, payload) {
    io.emit(`${ressource}:update`, payload);
}

// ----------------------------------------
// 1) TATAMIS
// ----------------------------------------
app.get('/api/tatamis', (req, res) => {
    res.json(lireJSON(tatamisFile));
});
app.get('/api/tatamis/:id/combat-actuel', (req, res) => {
    const tatamis = lireJSON(tatamisFile);
    const combats = lireJSON(combatsFile);
    const tatami = tatamis.find(t => t.id === +req.params.id);

    if (!tatami) return res.status(404).json({ error: "Tatami introuvable" });

    const combatId = tatami.combatsIds[tatami.indexCombatActuel];
    if (!combatId) return res.json(null);

    const combat = combats.find(c => c.id === combatId);
    return res.json(combat ? enrichCombatData(combat) : null);
});
app.get('/api/tatamis/:id/historique-combats', (req, res) => {
    const tatamis     = lireJSON(tatamisFile);
    const combats     = lireJSON(combatsFile);
    const equipes     = lireJSON(equipesFile);
    const combattants = lireJSON(combattantsFile);
    const id          = +req.params.id;
    const t           = tatamis.find(x => x.id === id);
    if (!t) return res.status(404).json({ error: 'Tatami non trouvé' });

    const historique = t.combatsIds.map((combatId, idx) => {
        const c = combats.find(x => x.id === combatId);
        if (!c) return null;
        const rComb  = combattants.find(x => x.id === c.rouge);
        const bComb  = combattants.find(x => x.id === c.bleu);
        const eRouge = equipes.find(x => x.id === rComb?.equipeId);
        const eBleu  = equipes.find(x => x.id === bComb?.equipeId);
        let gagnant = 'N/A';
        if (c.ipponRouge || c.wazariRouge >= 2 || c.penalitesBleu >= 3) gagnant = 'rouge';
        else if (c.ipponBleu || c.wazariBleu >= 2 || c.penalitesRouge >= 3) gagnant = 'bleu';
        return {
            index: idx+1,
            combatId: c.id,
            etat: c.etat,
            rouge: {
                nom: rComb?.nom, equipe: eRouge?.nom,
                wazari: c.wazariRouge, ippon: c.ipponRouge, shido: c.penalitesRouge
            },
            bleu: {
                nom: bComb?.nom, equipe: eBleu?.nom,
                wazari: c.wazariBleu, ippon: c.ipponBleu, shido: c.penalitesBleu
            },
            gagnant
        };
    }).filter(x => x);
    res.json(historique);
});
app.post('/api/tatamis', (req, res) => {
    const tatamis = lireJSON(tatamisFile);
    const newTatami = {
        id: Date.now(),
        nom: req.body.nom || `Tatami ${tatamis.length+1}`,
        etat: 'libre',
        combatsIds: [],
        indexCombatActuel: 0,
        dateCreation: new Date().toISOString(),
        historique: [],
        scoreConfrontation: { rouge:0, bleu:0 }
    };
    tatamis.push(newTatami);
    ecrireJSON(tatamisFile, tatamis);
    broadcast('tatamis', newTatami);
    res.status(201).json(newTatami);
});
app.patch('/api/tatamis/:id', (req, res) => {
    const tatamis = lireJSON(tatamisFile);
    const id      = +req.params.id;
    const t       = tatamis.find(x => x.id === id);
    if (!t) return res.status(404).json({ error:'Tatami non trouvé' });
    ['nom','etat','combatsIds','indexCombatActuel','historique','scoreConfrontation']
        .forEach(prop => { if (req.body[prop] !== undefined) t[prop] = req.body[prop]; });
    ecrireJSON(tatamisFile, tatamis);
    broadcast('tatamis', t);
    res.json(t);
});
app.patch('/api/tatamis/:id/assigner', (req, res) => {
    const tatamis = lireJSON(tatamisFile);
    const combats = lireJSON(combatsFile);
    const poules = lireJSON(poulesFile);

    const tatamiId = +req.params.id;
    const t = tatamis.find(x => x.id === tatamiId);
    if (!t) return res.status(404).json({ error: 'Tatami non trouvé' });

    if (!Array.isArray(req.body.combatsIds) || req.body.combatsIds.length === 0) {
        return res.status(400).json({ error: 'Liste combatsIds invalide.' });
    }

    // Vérifier les combats existants
    const combatsAssignes = [];
    for (const combatId of req.body.combatsIds) {
        const combat = combats.find(c => c.id === combatId);
        if (!combat) {
            return res.status(404).json({ error: `Combat ${combatId} introuvable.` });
        }
        combatsAssignes.push(combatId);
    }

    // --- NOUVEAU : Mise à jour des poules ---
    const premierCombat = combats.find(c => c.id === combatsAssignes[0]);
    if (premierCombat) {
        let rencontreTrouvee = null;
        for (const p of poules) {
            rencontreTrouvee = p.rencontres.find(r =>
                (r.equipeA === premierCombat.rouge.equipeId || r.equipeA === premierCombat.rouge.equipe) &&
                (r.equipeB === premierCombat.bleu.equipeId || r.equipeB === premierCombat.bleu.equipe)
            );
            if (rencontreTrouvee) {
                rencontreTrouvee.combatsIds = [
                    ...(rencontreTrouvee.combatsIds || []),
                    ...combatsAssignes
                ];
                break;
            }
        }
        if (rencontreTrouvee) {
            ecrireJSON(poulesFile, poules);
            io.emit('poules:update', poules);
        }
    }

    // Assignation au tatami
    t.combatsIds.push(...combatsAssignes);
    t.indexCombatActuel = 0;
    t.etat = 'occupé';
    t.historique.push({
        timestamp: new Date().toISOString(),
        action: 'assigner_combats',
        combats: combatsAssignes
    });

    ecrireJSON(tatamisFile, tatamis);
    io.emit('tatamis:update', t);

    res.json({ success: true, tatami: t });
});

app.patch('/api/tatamis/:id/etat', (req, res) => {
    const valides = ['libre','occupé','pause'];
    if (!valides.includes(req.body.etat)) return res.status(400).json({ error:'État invalide' });
    const tatamis = lireJSON(tatamisFile);
    const t       = tatamis.find(x => x.id===+req.params.id);
    if (!t) return res.status(404).json({ error:'Tatami non trouvé' });
    t.etat = req.body.etat;
    t.historique.push({ timestamp:new Date().toISOString(), action:'changer_etat', etat:req.body.etat });
    ecrireJSON(tatamisFile, tatamis);
    broadcast('tatamis', t);
    res.json({ success:true });
});
app.patch('/api/tatamis/:id/liberer', (req, res) => {
    const tatamis = lireJSON(tatamisFile);
    const t       = tatamis.find(x => x.id===+req.params.id);
    if (!t) return res.status(404).json({ error:'Tatami non trouvé' });
    t.combatsIds = [];
    t.indexCombatActuel = 0;
    t.etat = 'libre';
    t.scoreConfrontation = { rouge:0, bleu:0 };
    t.historique.push({ timestamp:new Date().toISOString(), action:'liberer_tatami' });
    ecrireJSON(tatamisFile, tatamis);
    broadcast('tatamis', t);
    res.json({ success:true, tatami:t });
});
app.post('/api/tatamis/:id/suivant', (req, res) => {
    const tatamis = lireJSON(tatamisFile);
    const t       = tatamis.find(x => x.id===+req.params.id);
    if (!t) return res.status(404).json({ error:'Tatami non trouvé' });
    if (t.indexCombatActuel < t.combatsIds.length-1) {
        t.indexCombatActuel++;
        t.historique.push({ timestamp:new Date().toISOString(), action:'combat_suivant', index:t.indexCombatActuel });
        ecrireJSON(tatamisFile, tatamis);

        const combats = lireJSON(combatsFile);
        const combatActuel = combats.find(c => c.id === t.combatsIds[t.indexCombatActuel]);

        io.emit('tatamis:update', { tatami: t, combatActuel });
        io.emit('combats:update', { tatamiId: t.id, combat: combatActuel });


        return res.json({ success:true, index:t.indexCombatActuel });
    }

    res.status(400).json({ error:'Déjà au dernier combat' });
});
app.post('/api/tatamis/:id/precedent', (req, res) => {
    const tatamis = lireJSON(tatamisFile);
    const t       = tatamis.find(x => x.id===+req.params.id);
    if (!t) return res.status(404).json({ error:'Tatami non trouvé' });
    if (t.indexCombatActuel > 0) {
        t.indexCombatActuel--;
        t.historique.push({ timestamp:new Date().toISOString(), action:'combat_precedent', index:t.indexCombatActuel });
        ecrireJSON(tatamisFile, tatamis);

        const combats = lireJSON(combatsFile);
        const combatActuel = combats.find(c => c.id === t.combatsIds[t.indexCombatActuel]);

        io.emit('tatamis:update', { tatami: t, combatActuel });
        io.emit('combats:update', { tatamiId: t.id, combat: combatActuel });


        return res.json({ success:true, index:t.indexCombatActuel });
    }

    res.status(400).json({ error:'Déjà au premier combat' });
});


// ----------------------------------------
// 2) COMBATS
// ----------------------------------------
app.get('/api/combats', (req, res) => {
    const combats = lireJSON(combatsFile).map(enrichCombatData);
    res.json(combats);
});
app.get('/api/combats/:id', (req, res) => {
    const combat = lireJSON(combatsFile).find(c => c.id === +req.params.id);
    return combat ? res.json(enrichCombatData(combat)) : res.status(404).json({ error: 'Combat introuvable' });
});
app.post('/api/combats',      (req, res) => {
    const cs = lireJSON(combatsFile);
    const nc = {
        id: Date.now(),
        rouge: req.body.rouge,
        bleu: req.body.bleu,
        etat: 'prévu',
        ipponRouge: false,
        ipponBleu: false,
        wazariRouge: 0,
        wazariBleu: 0,
        penalitesRouge: 0,
        penalitesBleu: 0,
        timer: req.body.timer ?? 180
    };
    cs.push(nc);
    ecrireJSON(combatsFile, cs);
    broadcast('combats', nc);
    res.status(201).json(nc);
});
app.patch('/api/combats/:id', (req, res) => {
    const cs = lireJSON(combatsFile);
    const c  = cs.find(x => x.id===+req.params.id);
    if (!c) return res.status(404).json({ error:'Combat introuvable' });
    Object.assign(c, req.body);
    ecrireJSON(combatsFile, cs);
    broadcast('combats', c);
    res.json(c);
});
app.delete('/api/combats/:id',(req,res)=>{
    let cs = lireJSON(combatsFile);
    cs     = cs.filter(x=>x.id!==+req.params.id);
    ecrireJSON(combatsFile, cs);
    broadcast('combats', { id:+req.params.id, deleted:true });
    res.json({ success:true });
});

function enrichCombatData(combat) {
    const equipes = lireJSON(equipesFile);
    const combattants = lireJSON(combattantsFile);
    const tatamis = lireJSON(tatamisFile);

    // Récupération des ID rouge et bleu
    const rougeId = typeof combat.rouge === "object" ? combat.rouge.id : combat.rouge;
    const bleuId = typeof combat.bleu === "object" ? combat.bleu.id : combat.bleu;
    console.log("bleuId :",bleuId);
    // Trouver les combattants
    const rougeCombattant = combattants.find(c => Number(c.id) === Number(rougeId));
    const bleuCombattant = combattants.find(c => Number(c.id) === Number(bleuId));

    // Trouver les équipes
    const rougeEquipe = rougeCombattant ? equipes.find(e => e.id === rougeCombattant.equipeId) : null;
    const bleuEquipe = bleuCombattant ? equipes.find(e => e.id === bleuCombattant.equipeId) : null;

    // Trouver le tatami
    const tatami = tatamis.find(t => Array.isArray(t.combatsIds) && t.combatsIds.includes(combat.id));
    console.log("tatamis :",tatami);
    if (!rougeCombattant || !bleuCombattant) {
        console.warn(`[enrichCombatData] Combattant rouge ou bleu introuvable pour combat ${combat.id}`);
    }

    if (!tatami) {
        console.warn(`[enrichCombatData] Combat ${combat.id} non assigné à un tatami`);
    }

    // Déterminer le vainqueur
    let vainqueur = null;
    if (combat.etat === "terminé") {
        if (combat.ipponRouge || (combat.wazariRouge || 0) >= 2 || (combat.penalitesBleu || 0) >= 3) {
            vainqueur = "rouge";
        } else if (combat.ipponBleu || (combat.wazariBleu || 0) >= 2 || (combat.penalitesRouge || 0) >= 3) {
            vainqueur = "bleu";
        }
    }

    console.log("==== ENRICH COMBAT ====");
    console.log("Combat:", combat);
    console.log("Rouge ID:", rougeId, "-> Combattant:", rougeCombattant);
    console.log("Bleu ID:", bleuId, "-> Combattant:", bleuCombattant);
    console.log("Rouge Equipe:", rougeEquipe);
    console.log("Bleu Equipe:", bleuEquipe);
    console.log("Tatami trouvé:", tatami ? tatami.nom : "Non assigné");


    return {
        ...combat,
        rouge: {
            id: rougeCombattant?.id || rougeId || null,
            nom: rougeCombattant?.nom || combat.rouge?.nom || "Inconnu",
            equipe: rougeEquipe?.nom || combat.rouge?.equipe || "N/A",
            poids: rougeCombattant?.poids || combat.rouge?.poids || "Non défini",
            wazari: combat.wazariRouge || 0,
            ippon: combat.ipponRouge || false,
            shido: combat.penalitesRouge || 0
        },
        bleu: {
            id: bleuCombattant?.id || bleuId || null,
            nom: bleuCombattant?.nom || combat.bleu?.nom || "Inconnu",
            equipe: bleuEquipe?.nom || combat.bleu?.equipe || "N/A",
            poids: bleuCombattant?.poids || combat.bleu?.poids || "Non défini",
            wazari: combat.wazariBleu || 0,
            ippon: combat.ipponBleu || false,
            shido: combat.penalitesBleu || 0
        },
        tatami: tatami ? tatami.nom : "Non assigné",
        vainqueur
    };
}





// ----------------------------------------
// 3) ÉQUIPES
// ----------------------------------------
app.get('/api/equipes',        (req, res) => res.json(lireJSON(equipesFile)));
app.post('/api/equipes',       (req, res) => {
    const eqs  = lireJSON(equipesFile);
    const newE = { id:req.body.id||`equipe-${Date.now()}`, nom:req.body.nom, couleur:req.body.couleur };
    eqs.push(newE);
    ecrireJSON(equipesFile, eqs);
    broadcast('equipes', newE);
    res.status(201).json(newE);
});
app.patch('/api/equipes/:id',  (req, res) => {
    const eqs = lireJSON(equipesFile);
    const e   = eqs.find(x => x.id===req.params.id);
    if (!e) return res.status(404).json({ error:'Équipe introuvable' });
    if (req.body.nom)     e.nom     = req.body.nom;
    if (req.body.couleur) e.couleur = req.body.couleur;
    ecrireJSON(equipesFile, eqs);
    broadcast('equipes', e);
    res.json(e);
});
app.patch('/api/equipes/:id/score',(req,res)=>{
    const eqs = lireJSON(equipesFile);
    const e   = eqs.find(x => x.id===req.params.id);
    if (!e) return res.status(404).json({ error:'Équipe introuvable' });
    e.points    = (e.points    || 0) + (parseInt(req.body.points)||0);
    e.victoires = (e.victoires || 0) + (parseInt(req.body.victoire)||0);
    ecrireJSON(equipesFile, eqs);
    broadcast('equipes', e);
    res.json({ success:true, points:e.points, victoires:e.victoires });
});
app.delete('/api/equipes/:id', (req, res) => {
    let eqs = lireJSON(equipesFile);
    eqs     = eqs.filter(x=>x.id!==req.params.id);
    ecrireJSON(equipesFile, eqs);
    broadcast('equipes', { id:req.params.id, deleted:true });
    res.json({ success:true });
});


// ----------------------------------------
// 4) COMBATTANTS
// ----------------------------------------
app.get('/api/combattants',       (req, res) => res.json(lireJSON(combattantsFile)));
app.post('/api/combattants',      (req, res) => {
    const cs = lireJSON(combattantsFile);
    const newC = { id:Date.now(), nom:req.body.nom, sexe:req.body.sexe, poids:req.body.poids, equipeId:req.body.equipeId };
    cs.push(newC);
    ecrireJSON(combattantsFile, cs);
    broadcast('combattants', newC);
    res.status(201).json(newC);
});
app.patch('/api/combattants/:id', (req, res) => {
    const cs = lireJSON(combattantsFile);
    const c  = cs.find(x=>x.id===+req.params.id);
    if (!c) return res.status(404).json({ error:'Combattant non trouvé' });
    ['nom','sexe','poids','equipeId'].forEach(k => {
        if (req.body[k] !== undefined) c[k] = req.body[k];
    });
    ecrireJSON(combattantsFile, cs);
    broadcast('combattants', c);
    res.json(c);
});
app.delete('/api/combattants/:id',(req,res)=>{
    let cs = lireJSON(combattantsFile);
    cs     = cs.filter(x=>x.id !== +req.params.id);
    ecrireJSON(combattantsFile, cs);
    broadcast('combattants', { id:+req.params.id, deleted:true });
    res.json({ success:true });
});


// ----------------------------------------
// 5) CONFIG
// ----------------------------------------
app.get('/api/config', (req, res) => {
    fs.readFile(configFile, 'utf8', (err,data) => {
        if (err) return res.status(500).json({ error:'Impossible de charger config' });
        res.json(JSON.parse(data));
    });
});

// ----------------------------------------
// 6) EXPORT / IMPORT / RESET
// ----------------------------------------

// Export: renvoie un JSON unique contenant tous les fichiers
app.get('/api/export', (req, res) => {
    const exportObj = {
        tatamis: lireJSON(tatamisFile),
        equipes: lireJSON(equipesFile),
        combattants: lireJSON(combattantsFile),
        combats: lireJSON(combatsFile),
        config: JSON.parse(fs.readFileSync(configFile, 'utf8'))
    };
    res.setHeader('Content-Disposition', 'attachment; filename="backup_judo.json"');
    res.json(exportObj);
});

// Import: remplace tous les fichiers par ceux reçus
app.post('/api/import', (req, res) => {
    const data = req.body;
    if (!data || !data.tatamis) return res.status(400).json({ error:'Format invalide' });
    ecrireJSON(tatamisFile, data.tatamis);
    ecrireJSON(equipesFile, data.equipes);
    ecrireJSON(combattantsFile, data.combattants);
    ecrireJSON(combatsFile, data.combats);
    fs.writeFileSync(configFile, JSON.stringify(data.config,null,2));
    // après import, demander à tous de recharger
    io.emit('data:update');
    res.json({ success:true });
});

// Reset: vide tout (sauf config)
app.post('/api/reset', (req, res) => {
    ecrireJSON(tatamisFile,     []);
    ecrireJSON(equipesFile,     []);
    ecrireJSON(combattantsFile, []);
    ecrireJSON(combatsFile,     []);
    // on ne touche pas à config.json
    io.emit('data:update');
    res.json({ success:true });
});

// ----------------------------------------
// 7) POULES
// ----------------------------------------
// GET toutes les poules
app.get('/api/poules', (req, res) => {
    res.json(lireJSON(poulesFile));
});

// POST création automatique des poules avec génération des rencontres
app.post('/api/poules', (req, res) => {
    const nbPoules = parseInt(req.body.nbPoules || 1);
    if (nbPoules <= 0) return res.status(400).json({ error: 'Nombre de poules invalide' });

    const equipes = lireJSON(equipesFile);
    if (equipes.length === 0) return res.status(400).json({ error: 'Aucune équipe disponible' });

    // Mélange aléatoire des équipes
    const shuffled = [...equipes].sort(() => Math.random() - 0.5);

    // Répartition dans les poules
    const poules = Array.from({ length: nbPoules }, (_, i) => ({
        id: i + 1,
        nom: `Poule ${String.fromCharCode(65 + i)}`,
        equipesIds: [],
        rencontres: [],
        classement: []
    }));

    shuffled.forEach((equipe, index) => {
        const idx = index % nbPoules;
        poules[idx].equipesIds.push(equipe.id);
        poules[idx].classement.push({ equipeId: equipe.id, points: 0, victoires: 0 });
    });

    // Génération des rencontres (round-robin)
    poules.forEach(p => {
        const eqs = p.equipesIds;
        for (let i = 0; i < eqs.length; i++) {
            for (let j = i + 1; j < eqs.length; j++) {
                const rencontreId = Date.now() + Math.floor(Math.random() * 10000);
                p.rencontres.push({
                    id: rencontreId,
                    equipeA: eqs[i],
                    equipeB: eqs[j],
                    combatsIds: [],   // On ne crée pas encore de combats
                    resultat: null
                });
            }
        }
    });

    // Sauvegarder uniquement les poules
    ecrireJSON(poulesFile, poules);

    // Broadcast
    broadcast('poules', poules);

    res.status(201).json(poules);
});

// PATCH mise à jour d'une poule (classement ou rencontres)
app.patch('/api/poules/:id', (req, res) => {
    const poules = lireJSON(poulesFile);
    const p      = poules.find(x => x.id === +req.params.id);
    if (!p) return res.status(404).json({ error: 'Poule introuvable' });

    if (req.body.classement) p.classement = req.body.classement;
    if (req.body.rencontres) p.rencontres = req.body.rencontres;

    ecrireJSON(poulesFile, poules);
    broadcast('poules', p);
    res.json(p);
});

app.patch('/api/poules/:id/classement', (req, res) => {
    const id = parseInt(req.params.id);
    const newClassement = req.body.classement;

    const poules = lireJSON(poulesFile);
    const poule = poules.find(p => p.id === id);

    if (!poule) return res.status(404).json({ error: "Poule non trouvée" });

    poule.classement = newClassement;
    ecrireJSON(poulesFile, poules);
    res.json({ success: true });
});

// DELETE reset des poules
app.delete('/api/poules', (req, res) => {
    ecrireJSON(poulesFile, []);
    broadcast('poules', []);
    res.json({ success: true });
});


// ----- Classement par poule et general ----

app.get('/api/classement/poule/:id', (req, res) => {
    try {
        const pouleId = +req.params.id;
        const poules = lireJSON(poulesFile);

        const poule = poules.find(p => p.id === pouleId);
        if (!poule) return res.status(404).json({ error: 'Poule non trouvée' });

        // On trie simplement le classement déjà présent
        poule.classement.sort((a, b) => {
            if (b.victoires !== a.victoires) return b.victoires - a.victoires;
            return b.points - a.points;
        });

        res.json(poule);
    } catch (err) {
        console.error('Erreur classement poule:', err);
        res.status(500).json({ error: 'Erreur interne' });
    }
});
app.get('/api/classement/general', (req, res) => {
    try {
        const poules = lireJSON(poulesFile);

        // Récupérer toutes les équipes et leurs stats depuis les poules
        const statsMap = new Map();

        poules.forEach(poule => {
            poule.classement.forEach(entry => {
                const { equipeId, points, victoires } = entry;
                if (!statsMap.has(equipeId)) {
                    statsMap.set(equipeId, { equipeId, points: 0, victoires: 0 });
                }
                const agg = statsMap.get(equipeId);
                agg.points += points;
                agg.victoires += victoires;
            });
        });

        // Transformer la Map en tableau
        const classementGeneral = Array.from(statsMap.values());

        // Trier par victoires puis points décroissants
        classementGeneral.sort((a, b) => {
            if (b.victoires !== a.victoires) return b.victoires - a.victoires;
            return b.points - a.points;
        });

        res.json(classementGeneral);
    } catch (err) {
        console.error('Erreur classement général:', err);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// --- API : Confrontations en cours ---
app.get('/api/confrontations/en-cours', (req, res) => {
    try {
        const tatamis = lireJSON(tatamisFile);
        const combats = lireJSON(combatsFile);

        const enCours = tatamis.flatMap(t => {
            if (!t.combatsIds || t.combatsIds.length === 0) return [];

            const index = t.indexCombatActuel ?? 0;
            const combatId = t.combatsIds[index];
            const combatActuel = combats.find(c => c.id === combatId);

            // On accepte les combats "en cours" ou "prévu"
            if (!combatActuel || !['en cours', 'prévu'].includes(combatActuel.etat)) return [];

            return [{
                tatami: t.nom || `Tatami ${t.id}`,
                equipeRougeId: combatActuel.rouge?.equipeId || combatActuel.rouge?.id,
                equipeBleuId: combatActuel.bleu?.equipeId || combatActuel.bleu?.id,
                equipeRougeNom: combatActuel.rouge?.equipe || combatActuel.rouge?.nom || 'Rouge',
                equipeBleuNom: combatActuel.bleu?.equipe || combatActuel.bleu?.nom || 'Bleu',
                combatId: combatActuel.id,
                etat: combatActuel.etat
            }];
        });

        res.json(enCours);
    } catch (e) {
        console.error('Erreur en-cours:', e);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});



// --- Utilitaires tableau ---
function lireTableau() {
    if (!fs.existsSync(tableauFile)) return { quart: [], demi: [], finale: [] };
    return JSON.parse(fs.readFileSync(tableauFile, 'utf8'));
}
function ecrireTableau(data) {
    fs.writeFileSync(tableauFile, JSON.stringify(data, null, 2));
}

// --------------------------
// TABLEAU ELIMINATOIRE
// --------------------------
app.get('/api/tableau', (req, res) => {
    res.json(lireTableau());
});

app.post('/api/tableau', (req, res) => {
    const { qualifiees } = req.body;
    if (!qualifiees || qualifiees.length < 2)
        return res.status(400).json({ error: 'Il faut au moins 2 équipes.' });

    const shuffled = qualifiees.sort(() => Math.random() - 0.5);

    // Déterminer la phase initiale
    const phases = ['huitieme', 'quart', 'demi', 'finale'];
    let startPhase = 'finale';
    if (shuffled.length > 2 && shuffled.length <= 4) startPhase = 'demi';
    else if (shuffled.length > 4 && shuffled.length <= 8) startPhase = 'quart';
    else if (shuffled.length > 8) startPhase = 'huitieme';

    const tableau = { huitieme: [], quart: [], demi: [], finale: [] };

    function generateMatches(teams, phaseKey) {
        const matches = [];
        for (let i = 0; i < teams.length; i += 2) {
            matches.push({
                id: i / 2 + 1,
                equipeA: teams[i] || null,
                equipeB: teams[i + 1] || null,
                scoreA: 0,
                scoreB: 0,
                vainqueur: null
            });
        }
        tableau[phaseKey] = matches;
    }

    generateMatches(shuffled, startPhase);

    // Préparer les phases suivantes
    const nextPhases = {
        huitieme: ['quart', 4],
        quart: ['demi', 2],
        demi: ['finale', 1],
        finale: []
    };

    let current = startPhase;
    while (nextPhases[current]?.length) {
        const [next, count] = nextPhases[current];
        tableau[next] = Array.from({ length: count }, (_, i) => ({
            id: i + 1,
            equipeA: null,
            equipeB: null,
            scoreA: 0,
            scoreB: 0,
            vainqueur: null
        }));
        current = next;
    }

    ecrireTableau(tableau);
    res.status(201).json({ startPhase, tableau });
});

app.patch('/api/tableau/:phase/:id', (req, res) => {
    const { phase, id } = req.params;
    const tableau = lireTableau();
    const match = tableau[phase]?.find(m => m.id === +id);
    if (!match) return res.status(404).json({ error: 'Match non trouvé' });

    match.scoreA = req.body.scoreA;
    match.scoreB = req.body.scoreB;
    match.vainqueur = req.body.vainqueur;

    ecrireTableau(tableau);
    res.json(match);
});

// Avancer le vainqueur vers la phase suivante
app.post('/api/tableau/advance/:phase/:id', (req, res) => {
    const { phase, id } = req.params;
    const tableau = lireTableau();
    const match = tableau[phase]?.find(m => m.id === +id);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    if (!match.vainqueur) return res.status(400).json({ error: 'Aucun vainqueur défini.' });

    const winner = match.vainqueur === 'A' ? match.equipeA : match.equipeB;

    // Logique d'avancement
    if (phase === 'quart') {
        const demiIndex = Math.floor((+id - 1) / 2);
        const demiMatch = tableau.demi[demiIndex];
        if ((+id % 2) === 1) demiMatch.equipeA = winner;
        else demiMatch.equipeB = winner;
    } else if (phase === 'demi') {
        const finaleMatch = tableau.finale[0];
        if (+id === 1) finaleMatch.equipeA = winner;
        else finaleMatch.equipeB = winner;
    }

    ecrireTableau(tableau);
    res.json({ success: true, tableau });
});

app.delete('/api/tableau', (req, res) => {
    ecrireTableau({ quart: [], demi: [], finale: [] });
    res.json({ success: true });
});

app.post('/api/logs', (req, res) => {
    const logs = lireJSON(logsFile);
    const nouveauLog = { id: Date.now(), ...req.body };
    logs.push(nouveauLog);
    ecrireJSON(logsFile, logs);
    console.error('LOG FRONTEND:', nouveauLog);
    res.json({ success: true });
});
// --- Lancement du serveur HTTP+WebSocket ---
server.listen(PORT, () => {
    console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
