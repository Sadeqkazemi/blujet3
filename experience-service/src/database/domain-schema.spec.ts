import { getMetadataArgsStorage } from 'typeorm';
import { dataSourceOptions } from './data-source.options';

describe('Experience database ownership', () => {
  it('uses only the experience schema', () => {
    expect(dataSourceOptions().entities).toBeDefined();
    const expected = [
      'blog_posts',
      'careers_settings',
      'contact_messages',
      'job_applications',
      'job_postings',
      'site_content_blocks',
      'site_destination_highlights',
      'site_media_assets',
      'site_route_highlights',
      'stored_files',
      'support_tickets',
      'survey_invites',
      'survey_questions',
      'survey_responses',
      'survey_settings',
    ];
    const tables = getMetadataArgsStorage().tables.filter(({ name }) =>
      expected.includes(name ?? ''),
    );

    expect(tables).toHaveLength(expected.length);
    expect(
      tables.map(({ name, schema }) => `${schema}.${name}`).sort(),
    ).toEqual(expected.map((table) => `experience.${table}`).sort());
  });
});
