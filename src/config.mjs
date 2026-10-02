// Agents that run outside GitHub (Cowork scheduled tasks, local scripts). GitHub cannot see these,
// so they are listed by hand. status: 'scheduled' | 'running' | 'ok' | 'fail' | 'idle'.
// A repo that is not in the loaded data is simply left out of the world, as is anything in it.
export const CONFIG = {
  localAgents: [
    { name: 'NL Tender Scraper', repo: 'netherlands-crm', schedule: 'Weekdays · Cowork', role: 'TED + TenderNed + web sweep', status: 'scheduled' },
    { name: 'Contacts Agent', repo: 'netherlands-crm', schedule: 'On demand · Cowork', role: 'Finds and enriches contacts', status: 'scheduled' },
    { name: 'News Agent', repo: 'netherlands-crm', schedule: 'On demand · Cowork', role: 'Institution news digest', status: 'scheduled' },
    { name: 'White-space Agent', repo: 'netherlands-crm', schedule: 'On demand · Cowork', role: 'Product gap analysis', status: 'scheduled' },
    { name: 'Job Watcher', repo: null, schedule: 'Daily · local', role: 'Scans 177 AI-company ATS feeds', status: 'scheduled' },
  ],
};
