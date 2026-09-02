import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { LocaleProvider } from './hooks/useLocale';
import { PanelNotifyProvider } from './hooks/usePanelNotify';
import ProtectedRoute from './components/ProtectedRoute';
import AgencyProtectedRoute from './components/AgencyProtectedRoute';
import PanelShell from './components/PanelShell';
import ComingSoonPage from './components/ComingSoonPage';
import DashboardRouter from './components/DashboardRouter';
import TabGate from './components/TabGate';
import AccessRevokedListener from './components/AccessRevokedListener';
import AircraftListPage from './features/aircraft/AircraftListPage';
import AircraftFormPage from './features/aircraft/AircraftFormPage';
import AircraftDetailPage from './features/aircraft/AircraftDetailPage';
import FlightRoutesPage from './features/flights/FlightRoutesPage';
import LoginPage from './features/auth/LoginPage';
import TwoFactorPage from './features/auth/TwoFactorPage';
import ForcePasswordChangePage from './features/auth/ForcePasswordChangePage';
import ForgotPasswordPage from './features/auth/ForgotPasswordPage';
import AgencyLoginPage from './features/agency-portal/AgencyLoginPage';
import AgencyPortalShell from './features/agency-portal/AgencyPortalShell';
import AgencyDashboardPage from './features/agency-portal/AgencyDashboardPage';
import AgencyTicketPage from './features/agency-portal/AgencyTicketPage';
import AgencySeatsPage from './features/agency-portal/AgencySeatsPage';
import AgencyWebservicePage from './features/agency-portal/AgencyWebservicePage';
import AgencyApiDocsPage from './features/agency-portal/AgencyApiDocsPage';
import AgencyCreditPage from './features/agency-portal/AgencyCreditPage';
import AgencySalesPage from './features/agency-portal/AgencySalesPage';
import AgencyNoticesPage from './features/agency-portal/AgencyNoticesPage';
import AgencyInboxPage from './features/agency-portal/AgencyInboxPage';
import AgencyProfilePage from './features/agency-portal/AgencyProfilePage';
import AgenciesRouter from './features/agencies/AgenciesRouter';
import AgencyDetailPage from './features/agencies/AgencyDetailPage';
import RequestDetailPage from './features/agencies/RequestDetailPage';
import ReportsRouter from './components/ReportsRouter';
import CartableRouter from './components/CartableRouter';
import ClubRouter from './features/club/ClubRouter';
import ClubPage from './features/club/ClubPage';
import ClubTierRulesPage from './features/club/ClubTierRulesPage';
import SiteAdminCustomersPage from './features/customers/SiteAdminCustomersPage';
import EmployeesPage from './features/it-manager/EmployeesPage';
import ServicesRouter from './features/services/ServicesRouter';
import WebservicesApiPage from './features/it-manager/WebservicesApiPage';
import BackupsPage from './features/it-manager/BackupsPage';
import PricingPage from './features/pricing/PricingPage';
import RefundsPage from './features/refunds/RefundsPage';
import SupportTicketsPage from './features/support-tickets/SupportTicketsPage';
import FlightsRouter from './components/FlightsRouter';
import FlightOpsPage from './features/flightops/FlightOpsPage';
import ReservationPage from './features/reservation/ReservationPage';
import FinancePage from './features/finance/FinancePage';
import FinanceReportsPage from './features/finance-reports/FinanceReportsPage';
import FinancialIntegrationsPage from './features/financial-integrations/FinancialIntegrationsPage';
import StaffReportsPage from './features/staff-reports/StaffReportsPage';
import ManagerReportsPage from './features/manager-reports/ManagerReportsPage';
import PanelAdminsPage from './features/admins/PanelAdminsPage';
import SettingsPage from './features/settings/SettingsPage';
import CommercialWebservicePage from './features/webservice/CommercialWebservicePage';
import AncillaryServicesPage from './features/ancillary-services/AncillaryServicesPage';
import SecurityRouter from './components/SecurityRouter';
import LogsRouter from './components/LogsRouter';
import ReferralsRouter from './components/ReferralsRouter';
import PanelsAccessPage from './features/panels-access/PanelsAccessPage';
import HomeSearchPage from './features/public-site/HomeSearchPage';
import ResultsPage from './features/public-site/ResultsPage';
import BookPage from './features/public-site/BookPage';
import CheckoutPage from './features/public-site/CheckoutPage';
import PaymentPage from './features/public-site/PaymentPage';
import TicketPage from './features/public-site/TicketPage';
import DestinationsPage from './features/public-site/DestinationsPage';
import PublicClubPage from './features/public-site/PublicClubPage';
import SupportPage from './features/public-site/SupportPage';
import TravelInfoPage from './features/public-site/TravelInfoPage';
import CustomerLoginPage from './features/public-site/CustomerLoginPage';
import ManageBookingPage from './features/public-site/ManageBookingPage';
import AboutPage from './features/public-site/AboutPage';
import ContactPage from './features/public-site/ContactPage';
import NotFoundPage from './features/public-site/NotFoundPage';
import FlightStatusPage from './features/public-site/FlightStatusPage';
import AccountPage from './features/public-site/AccountPage';
import MaintenancePage from './features/public-site/MaintenancePage';
import SurveyPage from './features/survey/SurveyPage';
import SurveyRouter from './components/SurveyRouter';
import CareersPage from './features/public-site/CareersPage';
import CareersApplyPage from './features/public-site/CareersApplyPage';
import {
  SeatSelectionInfoPage,
  ExtraBaggageInfoPage,
  RefundInfoPage,
  PetTravelInfoPage,
  WheelchairInfoPage,
} from './features/public-site/services/PublicServicePages';
import SelectServicesPage from './features/public-site/services/SelectServicesPage';
import CareersAdminPage from './features/careers/CareersAdminPage';
import MediaAdminPage from './features/site-content/MediaAdminPage';
import IdentityAdminPage from './features/identity-admin/IdentityAdminPage';
import AdminLoansPage from './features/loans/AdminLoansPage';
import SiteRulesPage from './features/site-content/SiteRulesPage';
import SandboxImpersonationBanner from './components/SandboxImpersonationBanner';
import FlightCancellationsPage from './features/flights/FlightCancellationsPage';
import SiteAdminAgencyBulletinsPage from './features/agency-bulletins/SiteAdminAgencyBulletinsPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <LocaleProvider>
        <PanelNotifyProvider>
        <AccessRevokedListener />
        <SandboxImpersonationBanner />
        <Routes>
          <Route path="/" element={<HomeSearchPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/book/:flightInstanceId" element={<BookPage />} />
          <Route path="/checkout/:bookingId" element={<CheckoutPage />} />
          <Route path="/payment/:bookingId" element={<PaymentPage />} />
          <Route path="/ticket/:pnr" element={<TicketPage />} />
          <Route path="/destinations" element={<DestinationsPage />} />
          <Route path="/club" element={<PublicClubPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/travel-info" element={<TravelInfoPage />} />
          <Route path="/terms" element={<TravelInfoPage />} />
          <Route path="/services/seat-selection" element={<SeatSelectionInfoPage />} />
          <Route path="/services/extra-baggage" element={<ExtraBaggageInfoPage />} />
          <Route path="/services/select" element={<SelectServicesPage />} />
          <Route path="/services/refund-info" element={<RefundInfoPage />} />
          <Route path="/services/pet-travel" element={<PetTravelInfoPage />} />
          <Route path="/services/wheelchair" element={<WheelchairInfoPage />} />
          <Route path="/signin" element={<CustomerLoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/manage-booking" element={<ManageBookingPage />} />
          <Route path="/flight-status" element={<FlightStatusPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/survey/:token" element={<SurveyPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/careers/:jobId/apply" element={<CareersApplyPage />} />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/two-factor" element={<TwoFactorPage />} />
          <Route path="/required-password-change" element={<ForcePasswordChangePage />} />
          <Route path="/agency/login" element={<AgencyLoginPage />} />

          <Route element={<AgencyProtectedRoute />}>
            <Route path="/agency" element={<AgencyPortalShell />}>
              <Route index element={<AgencyDashboardPage />} />
              <Route path="tickets" element={<AgencyTicketPage />} />
              <Route path="seats" element={<AgencySeatsPage />} />
              <Route path="credit" element={<AgencyCreditPage />} />
              <Route path="webservice" element={<AgencyWebservicePage />} />
              <Route path="apidocs" element={<AgencyApiDocsPage />} />
              <Route path="sales" element={<AgencySalesPage />} />
              <Route path="notices" element={<AgencyNoticesPage />} />
              <Route path="inbox" element={<AgencyInboxPage />} />
              <Route path="profile" element={<AgencyProfilePage />} />
            </Route>
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/panel" element={<PanelShell />}>
              <Route index element={<DashboardRouter />} />
              <Route path="agencies" element={<TabGate tabKey="agencies" />}>
                <Route index element={<AgenciesRouter />} />
                <Route path="requests/:requestId" element={<RequestDetailPage />} />
                <Route path=":agencyId" element={<AgencyDetailPage />} />
              </Route>
              <Route path="cartable" element={<TabGate tabKey="cartable" />}>
                <Route index element={<CartableRouter />} />
              </Route>
              <Route path="referrals" element={<TabGate tabKey="referrals" />}>
                <Route index element={<ReferralsRouter />} />
              </Route>
              <Route path="club" element={<TabGate tabKey="club" />}>
                <Route index element={<ClubRouter />} />
              </Route>
              <Route path="loans" element={<TabGate tabKey="loans" />}>
                <Route index element={<AdminLoansPage />} />
              </Route>
              <Route path="vip" element={<TabGate tabKey="vip" />}>
                <Route index element={<ClubPage />} />
              </Route>
              <Route path="clubrules" element={<TabGate tabKey="clubrules" />}>
                <Route index element={<ClubTierRulesPage />} />
              </Route>
              <Route path="webservice" element={<TabGate tabKey="webservice" />}>
                <Route index element={<CommercialWebservicePage />} />
              </Route>
              <Route path="ancillary-services" element={<TabGate tabKey="ancillary-services" />}>
                <Route index element={<AncillaryServicesPage />} />
              </Route>
              <Route path="survey" element={<TabGate tabKey="survey" />}>
                <Route index element={<SurveyRouter />} />
              </Route>
              <Route path="users" element={<TabGate tabKey="users" />}>
                <Route index element={<EmployeesPage />} />
              </Route>
              <Route path="security" element={<TabGate tabKey="security" />}>
                <Route index element={<SecurityRouter />} />
              </Route>
              <Route path="services" element={<TabGate tabKey="services" />}>
                <Route index element={<ServicesRouter />} />
              </Route>
              <Route path="webservices" element={<TabGate tabKey="webservices" />}>
                <Route index element={<WebservicesApiPage />} />
              </Route>
              <Route path="logs" element={<TabGate tabKey="logs" />}>
                <Route index element={<LogsRouter />} />
              </Route>
              <Route path="backup" element={<TabGate tabKey="backup" />}>
                <Route index element={<BackupsPage />} />
              </Route>
              <Route path="pricing" element={<TabGate tabKey="pricing" />}>
                <Route index element={<PricingPage />} />
              </Route>
              <Route path="flights" element={<TabGate tabKey="flights" />}>
                <Route index element={<FlightsRouter />} />
              </Route>
              <Route path="cancellations" element={<TabGate tabKey="cancellations" />}>
                <Route index element={<FlightCancellationsPage />} />
              </Route>
              <Route path="routes" element={<TabGate tabKey="routes" />}>
                <Route index element={<FlightRoutesPage />} />
              </Route>
              <Route path="aircraft" element={<TabGate tabKey="aircraft" />}>
                <Route index element={<AircraftListPage />} />
                <Route path="new" element={<AircraftFormPage />} />
                <Route path=":id" element={<AircraftDetailPage />} />
                <Route path=":id/edit" element={<AircraftFormPage />} />
              </Route>
              <Route path="flightops" element={<TabGate tabKey="flightops" />}>
                <Route index element={<FlightOpsPage />} />
              </Route>
              <Route path="refund" element={<TabGate tabKey="refund" />}>
                <Route index element={<RefundsPage />} />
              </Route>
              <Route path="tickets" element={<TabGate tabKey="tickets" />}>
                <Route index element={<SupportTicketsPage />} />
              </Route>
              <Route path="notices" element={<TabGate tabKey="notices" />}>
                <Route index element={<SiteAdminAgencyBulletinsPage />} />
              </Route>
              <Route path="jobapps" element={<TabGate tabKey="jobapps" />}>
                <Route index element={<CareersAdminPage />} />
              </Route>
              <Route path="rules" element={<TabGate tabKey="rules" />}>
                <Route index element={<SiteRulesPage />} />
              </Route>
              <Route path="media" element={<TabGate tabKey="media" />}>
                <Route index element={<MediaAdminPage />} />
              </Route>
              <Route path="kyc" element={<TabGate tabKey="kyc" />}>
                <Route index element={<IdentityAdminPage />} />
              </Route>
              <Route path="reservation" element={<TabGate tabKey="reservation" />}>
                <Route index element={<ReservationPage />} />
              </Route>
              <Route path="finance" element={<TabGate tabKey="finance" />}>
                <Route index element={<FinancePage />} />
              </Route>
              <Route path="exports" element={<TabGate tabKey="exports" />}>
                <Route index element={<FinanceReportsPage />} />
              </Route>
              <Route path="integrations" element={<TabGate tabKey="integrations" />}>
                <Route index element={<FinancialIntegrationsPage />} />
              </Route>
              <Route path="reports" element={<TabGate tabKey="reports" />}>
                <Route index element={<ReportsRouter />} />
              </Route>
              <Route path="customers" element={<TabGate tabKey="customers" />}>
                <Route index element={<SiteAdminCustomersPage />} />
                <Route path=":customerId" element={<SiteAdminCustomersPage />} />
              </Route>
              <Route path="staff" element={<TabGate tabKey="staff" />}>
                <Route index element={<StaffReportsPage />} />
              </Route>
              <Route path="mgrreports" element={<TabGate tabKey="mgrreports" />}>
                <Route index element={<ManagerReportsPage />} />
              </Route>
              <Route path="panels" element={<TabGate tabKey="panels" />}>
                <Route index element={<PanelsAccessPage />} />
              </Route>
              <Route path="admins" element={<TabGate tabKey="admins" />}>
                <Route index element={<PanelAdminsPage />} />
              </Route>
              <Route path="settings" element={<TabGate tabKey="settings" />}>
                <Route index element={<SettingsPage />} />
              </Route>
              <Route path=":tabKey" element={<ComingSoonPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </PanelNotifyProvider>
        </LocaleProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
