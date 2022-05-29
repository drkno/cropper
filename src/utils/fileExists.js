import { statSync } from 'node:fs';

const fileExists = file => {
    try {
        return !!(statSync(file));
    }
    catch(e) {
        return false;
    }
};

export default fileExists;
