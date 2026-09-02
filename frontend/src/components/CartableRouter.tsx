import { useAuth } from '../hooks/useAuth';
import CartablePage from '../features/cartable/CartablePage';
import EmployeeCartablePage from '../features/cartable/EmployeeCartablePage';
import OperationsCartablePage from '../features/operations/OperationsCartablePage';

/** The `cartable` tab key backs two views: exec panels get the full
 * review/transfer/compose UI (CartablePage); EMPLOYEE gets the simpler
 * design-v2 cartable with «انجام شد» + message-to-manager form. */
export default function CartableRouter() {
  const { user } = useAuth();
  return user?.role === 'EMPLOYEE'
    ? <EmployeeCartablePage />
    : user?.role === 'OPERATIONS_MANAGER'
      ? <OperationsCartablePage />
      : <CartablePage />;
}
