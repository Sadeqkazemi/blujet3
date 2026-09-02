import { useEffect, useState } from 'react';
import { fetchPublicAppLinks, fetchPublicSupportContact } from '../api/settings';
import type { PublicSupportContact } from '../types/app-links';

const DEFAULT_SUPPORT_CONTACT: PublicSupportContact = {
  phone: '021-44694471',
  email: 'info@blujet.com',
};

/** Public app links maintained by SITE_ADMIN. Empty values are ignored by the
 * footer, while a failed request leaves the safe default UI in place. */
export function usePublicAppLinks(): Record<string, string> {
  const [links, setLinks] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    fetchPublicAppLinks()
      .then((data) => {
        if (!alive) return;
        setLinks(Object.fromEntries(data.links.map((link) => [link.id, link.url])));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return links;
}

/** Support contact maintained by SITE_ADMIN in the site-content panel. */
export function usePublicSupportContact(): PublicSupportContact {
  const [contact, setContact] = useState<PublicSupportContact>(DEFAULT_SUPPORT_CONTACT);

  useEffect(() => {
    let alive = true;
    fetchPublicSupportContact()
      .then((data) => {
        if (!alive) return;
        setContact({
          phone: data.phone?.trim() || DEFAULT_SUPPORT_CONTACT.phone,
          email: data.email?.trim() || DEFAULT_SUPPORT_CONTACT.email,
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  return contact;
}
