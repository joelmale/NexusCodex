import { db, Campaign } from '@/db/schema';
import { saveAs } from 'file-saver';

export interface CampaignExport {
  version: string;
  exportedAt: number;
  exportedBy: string;

  campaign: Campaign;
  worlds: any[];
  sessions: any[];
  plotThreads: any[];
  clues: any[];
  npcs: any[];
  encounters: any[];
  notes: any[];
  journals: any[];
  journalEntries: any[];
  loreEntries: any[];
  codexLinks: any[];

  metadata: {
    totalNotes: number;
    totalSessions: number;
    totalNPCs: number;
    totalWorlds: number;
    totalPlotThreads: number;
    totalEncounters: number;
    campaignStatus: string;
    lastSessionDate?: number;
  };
}

export class ExportService {
  /**
   * Export a campaign to JSON format
   */
  async exportCampaign(campaignId: string): Promise<CampaignExport> {
    const campaign = await db.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    const [
      worlds,
      sessions,
      plotThreads,
      clues,
      npcs,
      encounters,
      notes,
      journals,
      journalEntries,
      loreEntries,
      codexLinks
    ] = await Promise.all([
      db.worlds.where('campaignId').equals(campaignId).toArray(),
      db.sessions.where('campaignId').equals(campaignId).toArray(),
      db.plotThreads.where('campaignId').equals(campaignId).toArray(),
      db.clues.where('campaignId').equals(campaignId).toArray(),
      db.npcs.where('campaignId').equals(campaignId).toArray(),
      db.encounters.where('campaignId').equals(campaignId).toArray(),
      db.notes.where('campaignId').equals(campaignId).toArray(),
      db.journals.where('campaignId').equals(campaignId).toArray(),
      db.journalEntries.where('campaignId').equals(campaignId).toArray(),
      db.loreEntries.where('campaignId').equals(campaignId).toArray(),
      db.codexLinks.where('campaignId').equals(campaignId).toArray()
    ]);

    const lastSession = sessions
      .filter(s => s.actualDate)
      .sort((a, b) => (b.actualDate || 0) - (a.actualDate || 0))[0];

    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      exportedBy: 'offline',
      campaign,
      worlds,
      sessions,
      plotThreads,
      clues,
      npcs,
      encounters,
      notes,
      journals,
      journalEntries,
      loreEntries,
      codexLinks,
      metadata: {
        totalNotes: notes.length,
        totalSessions: sessions.length,
        totalNPCs: npcs.length,
        totalWorlds: worlds.length,
        totalPlotThreads: plotThreads.length,
        totalEncounters: encounters.length,
        campaignStatus: campaign.status,
        lastSessionDate: lastSession?.actualDate
      }
    };
  }

  /**
   * Download campaign as JSON file
   */
  async downloadCampaignJSON(campaignId: string, filename?: string): Promise<void> {
    const data = await this.exportCampaign(campaignId);
    const campaign = await db.campaigns.get(campaignId);

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });

    const defaultFilename = `${campaign?.name || 'campaign'}-${Date.now()}.json`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    saveAs(blob, filename || defaultFilename);
  }

  /**
   * Import campaign from JSON
   */
  async importCampaign(
    data: CampaignExport,
    options: {
      overwrite?: boolean;
      newCampaignId?: boolean;
    } = {}
  ): Promise<string> {
    // Validation
    if (data.version !== '1.0.0') {
      throw new Error(`Unsupported export version: ${data.version}`);
    }

    if (!data.campaign) {
      throw new Error('Invalid export data: missing campaign');
    }

    let campaignId = data.campaign.id;

    // Generate new ID if requested
    if (options.newCampaignId) {
      campaignId = crypto.randomUUID();
      data = this.remapCampaignIds(data, campaignId);
    }

    // Check for conflicts
    if (!options.overwrite) {
      const existing = await db.campaigns.get(campaignId);
      if (existing) {
        throw new Error(
          'Campaign already exists. Enable overwrite option or import with new ID.'
        );
      }
    }

    // Import in transaction
    await db.transaction(
      'rw',
      [
        db.campaigns,
        db.worlds,
        db.sessions,
        db.plotThreads,
        db.clues,
        db.npcs,
        db.encounters,
        db.notes,
        db.journals,
        db.journalEntries,
        db.loreEntries,
        db.codexLinks
      ],
      async () => {
        await db.campaigns.put(data.campaign);
        await db.worlds.bulkPut(data.worlds);
        await db.sessions.bulkPut(data.sessions);
        await db.plotThreads.bulkPut(data.plotThreads);
        await db.clues.bulkPut(data.clues);
        await db.npcs.bulkPut(data.npcs);
        await db.encounters.bulkPut(data.encounters);
        await db.notes.bulkPut(data.notes);
        await db.journals.bulkPut(data.journals);
        await db.journalEntries.bulkPut(data.journalEntries);
        await db.loreEntries.bulkPut(data.loreEntries);
        await db.codexLinks.bulkPut(data.codexLinks);
      }
    );

    return campaignId;
  }

  /**
   * Remap campaign IDs (for importing as new campaign)
   */
  private remapCampaignIds(
    data: CampaignExport,
    newCampaignId: string
  ): CampaignExport {
    const idMap = new Map<string, string>();
    idMap.set(data.campaign.id, newCampaignId);

    // Generate new IDs for all entities
    const generateNewIds = (items: any[], type: string) => {
      return items.map(item => {
        const newId = crypto.randomUUID();
        idMap.set(item.id, newId);
        return { ...item, id: newId, campaignId: newCampaignId };
      });
    };

    const worlds = generateNewIds(data.worlds, 'world');
    const sessions = generateNewIds(data.sessions, 'session');
    const plotThreads = generateNewIds(data.plotThreads, 'plotThread');
    const clues = generateNewIds(data.clues, 'clue');
    const npcs = generateNewIds(data.npcs, 'npc');
    const encounters = generateNewIds(data.encounters, 'encounter');
    const notes = generateNewIds(data.notes, 'note');
    const journals = generateNewIds(data.journals, 'journal');
    const journalEntries = generateNewIds(data.journalEntries, 'journalEntry');
    const loreEntries = generateNewIds(data.loreEntries, 'loreEntry');
    const codexLinks = generateNewIds(data.codexLinks, 'codexLink');

    // Update foreign key references
    const updateReferences = (item: any) => {
      const updated = { ...item };

      // Update common references
      if (updated.plotThreadId && idMap.has(updated.plotThreadId)) {
        updated.plotThreadId = idMap.get(updated.plotThreadId);
      }
      if (updated.sessionId && idMap.has(updated.sessionId)) {
        updated.sessionId = idMap.get(updated.sessionId);
      }
      if (updated.parentThreadId && idMap.has(updated.parentThreadId)) {
        updated.parentThreadId = idMap.get(updated.parentThreadId);
      }
      if (updated.parentWorldId && idMap.has(updated.parentWorldId)) {
        updated.parentWorldId = idMap.get(updated.parentWorldId);
      }
      if (updated.journalId && idMap.has(updated.journalId)) {
        updated.journalId = idMap.get(updated.journalId);
      }
      if (updated.entityId && idMap.has(updated.entityId)) {
        updated.entityId = idMap.get(updated.entityId);
      }

      return updated;
    };

    return {
      ...data,
      campaign: { ...data.campaign, id: newCampaignId },
      worlds: worlds.map(updateReferences),
      sessions: sessions.map(updateReferences),
      plotThreads: plotThreads.map(updateReferences),
      clues: clues.map(updateReferences),
      npcs: npcs.map(updateReferences),
      encounters: encounters.map(updateReferences),
      notes: notes.map(updateReferences),
      journals: journals.map(updateReferences),
      journalEntries: journalEntries.map(updateReferences),
      loreEntries: loreEntries.map(updateReferences),
      codexLinks: codexLinks.map(updateReferences)
    };
  }

  /**
   * Validate export data
   */
  validateExport(data: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.version) {
      errors.push('Missing version');
    } else if (data.version !== '1.0.0') {
      errors.push(`Unsupported version: ${data.version}`);
    }

    if (!data.campaign) {
      errors.push('Missing campaign data');
    } else {
      if (!data.campaign.id) errors.push('Missing campaign ID');
      if (!data.campaign.name) errors.push('Missing campaign name');
      if (!data.campaign.gameSystem) errors.push('Missing game system');
    }

    if (!data.metadata) {
      errors.push('Missing metadata');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

export const exportService = new ExportService();
