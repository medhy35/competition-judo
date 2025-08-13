// config.js
const Config = (function () {
    let general = {};
    let mode = {};

    async function chargerConfigurations() {
        try {
            const [genRes, modeRes] = await Promise.all([
                fetch('/config/config_general.json'),
                fetch('/config/config_mode.json'),
            ]);

            if (!genRes.ok || !modeRes.ok) {
                throw new Error('Erreur lors du chargement des fichiers de configuration.');
            }

            general = await genRes.json();
            mode = await modeRes.json();
            console.log('[Config] Fichiers de configuration chargés.');
        } catch (err) {
            console.error('[Config] Échec du chargement :', err);
        }
    }

    function getParamGeneral(cle) {
        return general?.[cle];
    }

    function getParamMode(nomMode, cle) {
        return mode?.[nomMode]?.[cle];
    }

    function getTousLesParams() {
        return { general, mode };
    }

    return {
        chargerConfigurations,
        getParamGeneral,
        getParamMode,
        getTousLesParams
    };
})();
