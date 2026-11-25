/** Keep native renderer contracts in suites which own bitmap text rendering. */
export function preserveNativeBitmapText(plugins = []) {
    return plugins.some(
        (plugin) => plugin.status === true && plugin.name?.split('/').pop() === 'UskCoreOverWrite'
    );
}
