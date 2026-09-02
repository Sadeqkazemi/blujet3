import { useAuth } from "../hooks/useAuth";
import FlightsPage from "../features/flights/FlightsPage";
import OperationsFlightsPage from "../features/operations/OperationsFlightsPage";

export default function FlightsRouter() {
  const { user } = useAuth();
  if (user?.role === "OPERATIONS_MANAGER") return <OperationsFlightsPage />;
  return <FlightsPage />;
}
