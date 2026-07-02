import fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
let electronExe = require('electron')
console.log(electronExe, fs.existsSync(electronExe))
