import { blockPopups } from './popupBlocker';
import { guardRedirect } from './redirectGuard';
import { cleanFacebook } from './facebookCleaner';


blockPopups();
guardRedirect();
cleanFacebook();