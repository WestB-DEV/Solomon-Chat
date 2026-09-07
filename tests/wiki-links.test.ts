import { describe, expect, it } from 'vitest';
import { wikiLinkAtCursor, completeWikiLink } from '../src/wiki-links';

describe('composer wiki links', () => {
  it('finds an unfinished link at the cursor, not ordinary text', () => {
    expect(wikiLinkAtCursor('Discuss [[My note',17,17)).toEqual({from:8,to:17,query:'My note'});
    expect(wikiLinkAtCursor('Discuss a note',14,14)).toBeNull();
    expect(wikiLinkAtCursor('[[Done]] text',13,13)).toBeNull();
  });
  it('replaces just the active link and consumes an existing closing pair', () => {
    const text='Before [[No]] after';
    const range=wikiLinkAtCursor(text,11,11)!;
    expect(completeWikiLink(text,range,'Folder/Note')).toEqual({text:'Before [[Folder/Note]] after',cursor:22});
  });
  it('does not suggest across lines, selected text, aliases or subpaths', () => {
    for(const text of ['[[no\nmore','[[Note|alias','[[Note#heading','`[[code'])expect(wikiLinkAtCursor(text,text.length,text.length)).toBeNull();
    expect(wikiLinkAtCursor('[[Note',2,6)).toBeNull();
  });
  it('retains unresolved names as text without creating a file', () => {
    expect(completeWikiLink('[[New',wikiLinkAtCursor('[[New',5,5)!,'New page').text).toBe('[[New page]]');
  });
});
