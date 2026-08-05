const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withFmtFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      let content = fs.readFileSync(podfilePath, 'utf-8');

      if (content.includes('FMT_USE_CONSTEVAL')) {
        return config; // zaten eklenmiş
      }

      const patch = `
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
      end
    end
  end
`;

      if (content.includes('post_install do |installer|')) {
        // mevcut post_install bloğunun içine ekle
        content = content.replace(
          'post_install do |installer|',
          `post_install do |installer|\n${patch}`
        );
      } else {
        // post_install bloğu yoksa dosyanın sonuna ekle
        content += `\npost_install do |installer|\n${patch}\nend\n`;
      }

      fs.writeFileSync(podfilePath, content);
      return config;
    },
  ]);
};

module.exports = withFmtFix;