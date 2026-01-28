import { installPopupBlocker } from './popupBlocker';
import { installRedirectGuard } from './redirectGuard';
import { cleanFacebook } from './facebookCleaner';

const ALLOW_HOSTS = [
  // thêm các site bạn muốn bật guard mạnh
  'nhieutruyen.com',
  'metruyenchu.com',
  'facebook.com',
];

function isAllowedHost() {
  const h = location.hostname;
  return ALLOW_HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
}

function main() {
  if (!isAllowedHost()) return;

  // popup blocker + window.close guard (có heuristic trong file)
  installPopupBlocker({
    debug: false,
  });

  // redirect guard
  installRedirectGuard({
    debug: false,
  });

  // facebook cleaner chỉ chạy nếu đúng fb
  cleanFacebook();
}

main();
