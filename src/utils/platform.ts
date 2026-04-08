/**
 * Platform detection utilities for cross-platform support
 */

const isLinux = process.platform === 'linux';
export const isWSL = isLinux && process.env.WSL_DISTRO_NAME !== undefined;
