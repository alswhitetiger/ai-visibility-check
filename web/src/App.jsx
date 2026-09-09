import Experience from './Experience';
import AccountPage from './AccountPage';

export default function App() {
  const accountRoute = /\/(signup|login|account)\/?$/.test(location.pathname);
  return accountRoute ? <AccountPage /> : <Experience />;
}
