/**
 * tests/reproduce_magic_numbers_animation.test.ts
 *
 * REPRODUCTION TEST: UI animation directives (v-gsap-hover, v-gsap-entrance)
 * and motion offset properties (x, y, duration, delay, scale, etc.)
 * in Vue templates and animation objects should not be flagged as magic numbers.
 */

import { describe, it, expect } from 'vitest';
import { magicNumbers } from '../src/suites/architecture/audit_rules.ts';

describe('Reproduction: Magic Numbers on GSAP / UI Animation Properties', () => {
  it('does not flag GSAP directives and animation offsets as magic numbers', () => {
    const vueTemplateSnippet = `
      <template>
        <div v-gsap-hover="{ scale: 1.01, y: 10 }" class="my-card">
          <span class="btn">Click</span>
        </div>
      </template>
    `;

    const vueScriptSnippet = `
      <script setup lang="ts">
      gsap.to(cardRef.value, { y: 10, duration: 0.3 });
      </script>
    `;

    const regex = new RegExp(magicNumbers.regex.source, magicNumbers.regex.flags);
    let flaggedTemplate = false;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(vueTemplateSnippet)) !== null) {
      if (magicNumbers.check?.(vueTemplateSnippet, match, 'src/components/MyCard.vue')) {
        flaggedTemplate = true;
      }
    }

    expect(flaggedTemplate, 'v-gsap-hover with y: 10 should not be flagged as a magic number').toBe(false);

    let flaggedScript = false;
    regex.lastIndex = 0;
    while ((match = regex.exec(vueScriptSnippet)) !== null) {
      if (magicNumbers.check?.(vueScriptSnippet, match, 'src/components/MyCard.vue')) {
        flaggedScript = true;
      }
    }

    expect(flaggedScript, 'gsap.to with y: 10 should not be flagged as a magic number').toBe(false);
  });
});
