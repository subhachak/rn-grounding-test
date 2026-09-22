// Vendor adapters: reviewed, deterministic recipes for operating a vendor
// component's internals, which static extraction cannot see (the native
// wheels inside a date picker). Keyed by the package the component is
// imported from. The gate allows the `choose` action only on an element from
// a package listed here (G10), with a value in the adapter's format; codegen
// calls the adapter's helper, implemented once in base.page.ts.

export interface VendorAdapter {
  helper: string; // exported by base.page.ts
  value: RegExp; // accepted value format
  valueHint: string;
  platforms: ('android' | 'ios')[]; // where the helper is implemented and device-verified
}

export const VENDOR_ADAPTERS: Record<string, VendorAdapter> = {
  '@react-native-community/datetimepicker': {
    helper: 'chooseDate',
    value: /^\d{4}-\d{2}-\d{2}$/,
    valueHint: 'YYYY-MM-DD',
    platforms: ['ios'],
  },
};

export const adapterFor = (module: string | undefined) => (module ? VENDOR_ADAPTERS[module] : undefined);
