interface SpellData {
  name: string;
  level: string;
  school: string;
  castingTime?: string;
  range?: string;
  components?: string;
  duration?: string;
  description?: string;
}

interface MonsterData {
  name: string;
  size?: string;
  type?: string;
  alignment?: string;
  ac?: string;
  hp?: string;
  speed?: string;
  abilities?: Record<string, number>;
  cr?: string;
}

interface ItemData {
  name: string;
  type?: string;
  rarity?: string;
  attunement?: boolean;
  description?: string;
}

class ExtractionService {
  /**
   * Extract spell blocks from text using pattern matching
   */
  extractSpells(text: string): SpellData[] {
    const spells: SpellData[] = [];

    // Pattern: Spell Name followed by level and school
    // Example: "Fireball\n3rd-level evocation"
    const spellPattern = /([A-Z][a-zA-Z\s']+)\n(\d+(?:st|nd|rd|th)-level\s+\w+|Cantrip)/gm;

    let match;
    while ((match = spellPattern.exec(text)) !== null) {
      const name = match[1].trim();
      const levelSchool = match[2];

      // Extract level and school
      const levelMatch = levelSchool.match(/(\d+)(?:st|nd|rd|th)-level\s+(\w+)/);
      const isCantrip = levelSchool.toLowerCase().includes('cantrip');

      const spell: SpellData = {
        name,
        level: isCantrip ? 'Cantrip' : (levelMatch ? levelMatch[1] : ''),
        school: isCantrip ? this.extractSchoolFromCantrip(text, match.index) : (levelMatch ? levelMatch[2] : ''),
      };

      // Extract additional details from the block
      const blockStart = match.index;
      const blockEnd = this.findBlockEnd(text, blockStart);
      const block = text.substring(blockStart, blockEnd);

      spell.castingTime = this.extractField(block, /Casting Time:\s*([^\n]+)/);
      spell.range = this.extractField(block, /Range:\s*([^\n]+)/);
      spell.components = this.extractField(block, /Components:\s*([^\n]+)/);
      spell.duration = this.extractField(block, /Duration:\s*([^\n]+)/);
      spell.description = this.extractDescription(block);

      spells.push(spell);
    }

    return spells;
  }

  /**
   * Extract monster stat blocks from text
   */
  extractMonsters(text: string): MonsterData[] {
    const monsters: MonsterData[] = [];

    // Pattern for monster stat blocks (simplified)
    // Looking for name followed by size/type/alignment
    const monsterPattern = /([A-Z][a-zA-Z\s]+)\n([A-Z][a-z]+\s+[a-z]+(?:\s+\([a-z\s]+\))?,\s*[a-z\s]+)/gm;

    let match;
    while ((match = monsterPattern.exec(text)) !== null) {
      const name = match[1].trim();
      const sizeTypeAlignment = match[2];

      const monster: MonsterData = {
        name,
      };

      // Extract details from the type line
      const typeMatch = sizeTypeAlignment.match(/([A-Z][a-z]+)\s+([a-z]+(?:\s+\([a-z\s]+\))?),\s*([a-z\s]+)/);
      if (typeMatch) {
        monster.size = typeMatch[1];
        monster.type = typeMatch[2];
        monster.alignment = typeMatch[3];
      }

      // Extract stats from block
      const blockStart = match.index;
      const blockEnd = this.findBlockEnd(text, blockStart);
      const block = text.substring(blockStart, blockEnd);

      monster.ac = this.extractField(block, /Armor Class\s+(\d+(?:\s+\([^)]+\))?)/);
      monster.hp = this.extractField(block, /Hit Points\s+([\d\s+d()]+)/);
      monster.speed = this.extractField(block, /Speed\s+([^\n]+)/);
      monster.cr = this.extractField(block, /Challenge\s+([\d/]+)/);

      monsters.push(monster);
    }

    return monsters;
  }

  /**
   * Extract magic items from text
   */
  extractItems(text: string): ItemData[] {
    const items: ItemData[] = [];

    // Pattern for magic items
    // Looking for item name followed by type/rarity
    const itemPattern = /([A-Z][a-zA-Z\s,']+)\n(Weapon|Armor|Wondrous item|Potion|Ring|Rod|Staff|Wand)[,\s]+([a-z\s]+)/gm;

    let match;
    while ((match = itemPattern.exec(text)) !== null) {
      const name = match[1].trim();
      const type = match[2];
      const rarity = match[3].trim();

      const item: ItemData = {
        name,
        type,
        rarity,
      };

      // Check for attunement requirement
      const blockStart = match.index;
      const blockEnd = this.findBlockEnd(text, blockStart);
      const block = text.substring(blockStart, blockEnd);

      item.attunement = block.toLowerCase().includes('requires attunement');
      item.description = this.extractDescription(block);

      items.push(item);
    }

    return items;
  }

  /**
   * Helper: Extract a field value using regex
   */
  private extractField(text: string, pattern: RegExp): string | undefined {
    const match = text.match(pattern);
    return match ? match[1].trim() : undefined;
  }

  /**
   * Helper: Extract description (first paragraph after header info)
   */
  private extractDescription(block: string): string | undefined {
    const lines = block.split('\n');
    const descriptionLines: string[] = [];
    let foundHeader = false;

    for (const line of lines) {
      // Skip header lines (contain colons)
      if (line.includes(':')) {
        foundHeader = true;
        continue;
      }

      if (foundHeader && line.trim().length > 0) {
        descriptionLines.push(line.trim());
        if (descriptionLines.length >= 3) break; // Take first few lines
      }
    }

    return descriptionLines.length > 0 ? descriptionLines.join(' ') : undefined;
  }

  /**
   * Helper: Find the end of a content block
   */
  private findBlockEnd(text: string, start: number): number {
    // Find next major section (e.g., next spell, monster, or two consecutive newlines)
    const remaining = text.substring(start);
    const nextBlock = remaining.substring(100).search(/\n\n[A-Z]/);

    if (nextBlock !== -1) {
      return start + 100 + nextBlock;
    }

    return Math.min(start + 1000, text.length); // Max 1000 chars per block
  }

  /**
   * Helper: Extract school from cantrip description
   */
  private extractSchoolFromCantrip(text: string, index: number): string {
    const block = text.substring(index, Math.min(index + 200, text.length));
    const schoolMatch = block.match(/(evocation|conjuration|transmutation|necromancy|abjuration|divination|enchantment|illusion)/i);
    return schoolMatch ? schoolMatch[1] : '';
  }

  /**
   * Auto-detect and extract all structured data
   */
  extractAll(text: string): {
    spells: SpellData[];
    monsters: MonsterData[];
    items: ItemData[];
  } {
    return {
      spells: this.extractSpells(text),
      monsters: this.extractMonsters(text),
      items: this.extractItems(text),
    };
  }
}

export const extractionService = new ExtractionService();
