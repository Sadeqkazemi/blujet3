import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { fetchEmployeeContext } from '../../api/panels';
import type { EmployeeContext } from '../../types/panels';
import ItServicesPage from '../it-manager/ServicesPage';
import AncillaryServicesPage from '../ancillary-services/AncillaryServicesPage';

export default function ServicesRouter() {
  const { user } = useAuth();
  const [employeeContext, setEmployeeContext] = useState<EmployeeContext | null>(null);

  useEffect(() => {
    if (user?.role !== 'EMPLOYEE') {
      setEmployeeContext(null);
      return;
    }

    let cancelled = false;
    fetchEmployeeContext()
      .then((context) => {
        if (!cancelled) setEmployeeContext(context);
      })
      .catch(() => {
        // Keep the IT-safe fallback when the employee context cannot be read.
        if (!cancelled) setEmployeeContext(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.role]);

  // Commercial employees use the same ancillary-service pricing surface as
  // the commercial manager. Travel-cost management is a separate flight
  // permission/tab (`fl_costs`) and must not be exposed from this entry.
  const isCommercialUnit =
    user?.role === 'COMMERCIAL_MANAGER' ||
    (user?.role === 'EMPLOYEE' &&
      (employeeContext?.dept === 'commercial' || employeeContext?.dept === 'sales'));

  if (isCommercialUnit) {
    return <AncillaryServicesPage />;
  }

  return <ItServicesPage />;
}
