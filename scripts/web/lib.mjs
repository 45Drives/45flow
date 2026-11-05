// Pure helpers for building and packaging the 45flow-web bundle (D-33).
// Kept free of file and process access so the naming and metadata rules are testable.

export const WEB_ROOT = '/opt/45drives/45flow-web'
export const PACKAGE_NAME = '45flow-web'
export const PACKAGE_SUMMARY = '45Flow web app, served by the Houston Broadcaster at /app'

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/

export function assertVersion(version) {
  if (!VERSION.test(String(version))) throw new Error(`Unsupported version "${version}". Use x.y.z or x.y.z-prerelease.`)
  return version
}

/** A pre-release must sort before its release: 1.0.9-beta.1 -> 1.0.9~beta.1 (deb and rpm). */
export const debVersion = (version) => assertVersion(version).replace('-', '~')
export const rpmVersion = (version) => assertVersion(version).replace('-', '~')

export const debFileName = (version) => `${PACKAGE_NAME}_${debVersion(version)}_all.deb`
export const rpmFileName = (version, release = 1) => `${PACKAGE_NAME}-${rpmVersion(version)}-${release}.noarch.rpm`
export const tarFileName = (version) => `${PACKAGE_NAME}-${assertVersion(version)}.tar.gz`

export function packageManifest(pkg, manifest) {
  const version = debVersion(pkg.version)
  return { ...manifest, version, changelog: { ...manifest.changelog, version, build_number: manifest.build_number } }
}

/** The file the app serves at /app/version.json, so what is deployed can be confirmed. */
export function versionInfo({ version, commit, dirty, buildDate }) {
  return {
    name: PACKAGE_NAME,
    version: assertVersion(version),
    commit: commit ? `${commit}${dirty ? '-dirty' : ''}` : null,
    buildDate,
  }
}

export function debControl({ version, maintainer, installedSizeKb }) {
  return [
    `Package: ${PACKAGE_NAME}`,
    `Version: ${debVersion(version)}`,
    'Section: web',
    'Priority: optional',
    'Architecture: all',
    `Maintainer: ${maintainer}`,
    `Installed-Size: ${installedSizeKb}`,
    // The app is only reachable once the Broadcaster's nginx has the /app location.
    'Recommends: houston-broadcaster',
    `Description: ${PACKAGE_SUMMARY}`,
    ` Static files for the 45Flow browser UI, installed to ${WEB_ROOT}.`,
    ' Served by the Houston Broadcaster nginx behind the admin allowlist.',
    '',
  ].join('\n')
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function rpmChangelogDate(date) {
  const d = new Date(date)
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, '0')} ${d.getUTCFullYear()}`
}

export function rpmSpec({ version, release = 1, maintainer, date }) {
  return `Name:           ${PACKAGE_NAME}
Version:        ${rpmVersion(version)}
Release:        ${release}
Summary:        ${PACKAGE_SUMMARY}
License:        GPL-3.0-only
BuildArch:      noarch
AutoReqProv:    no
Recommends:     houston-broadcaster

%description
Static files for the 45Flow browser UI, installed to ${WEB_ROOT}.
Served by the Houston Broadcaster nginx behind the admin allowlist.

%prep

%build

%install
mkdir -p %{buildroot}${WEB_ROOT}
cp -a %{stage}/. %{buildroot}${WEB_ROOT}/

%files
%defattr(0644,root,root,0755)
${WEB_ROOT}

%changelog
* ${rpmChangelogDate(date)} ${maintainer} - ${rpmVersion(version)}-${release}
- Build of 45flow-web ${version}
`
}
