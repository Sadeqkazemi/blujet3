import { useEffect, useState } from 'react';
import { fetchPublicSocialLinks } from '../api/settings';
import type { PublicSocialLink } from '../types/social-links';

/** Active footer social links — empty until fetch resolves; stays empty on error. */
export function useSocialLinks(): PublicSocialLink[] {
  const [links, setLinks] = useState<PublicSocialLink[]>([]);

  useEffect(() => {
    let alive = true;
    fetchPublicSocialLinks()
      .then((data) => {
        if (alive) setLinks(data.links);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return links;
}
