import { appelerEdge } from './seo.service';

export const partenariatsService = {
  listProspects(appId, filtres = {}) {
    return appelerEdge('admin-partenariats', { action: 'list-prospects', appId, ...filtres });
  },
  saveProspect(appId, prospect) {
    return appelerEdge('admin-partenariats', { action: 'save-prospect', appId, prospect });
  },
  deleteProspect(appId, prospectId) {
    return appelerEdge('admin-partenariats', { action: 'delete-prospect', appId, prospectId });
  },
  importCsv(appId, type, lignes) {
    return appelerEdge('admin-partenariats', { action: 'import-csv', appId, type, lignes });
  },
  importDiagnostiqueurs(appId, departement) {
    return appelerEdge('admin-partenariats', { action: 'import-diagnostiqueurs', appId, departement });
  },
  listCampagnes(appId) {
    return appelerEdge('admin-partenariats', { action: 'list-campagnes', appId });
  },
  saveCampagne(appId, campagne) {
    return appelerEdge('admin-partenariats', { action: 'save-campagne', appId, campagne });
  },
  previewSegment(appId, segment) {
    return appelerEdge('admin-partenariats', { action: 'preview-segment', appId, segment });
  },
  sendTest(appId, campagneId, email) {
    return appelerEdge('admin-partenariats', { action: 'send-test', appId, campagneId, email });
  },
  sendCampaign(appId, campagneId) {
    return appelerEdge('admin-partenariats', { action: 'send-campaign', appId, campagneId });
  },
  campaignStats(appId, campagneId) {
    return appelerEdge('admin-partenariats', { action: 'campaign-stats', appId, campagneId });
  },
};
