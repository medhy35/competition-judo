// js/configLoader.js

export async function chargerConfiguration() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error('Erreur HTTP');

        const config = await response.json();
        return config;
    } catch (err) {
        console.error("Erreur lors du chargement de la configuration :", err);
        return {
            combatDuration: 180,
            points: { ippon: 10, wazari: 7, shido: 0 },
            thresholds: { shidoForDefeat: 3, wazariForIppon: 2 },
            enableGoldenScore: true,
            weightCategories: ["-60", "-66", "-73", "-81", "-90", "+90",  "-100",  "+100"]
        };
    }
}
