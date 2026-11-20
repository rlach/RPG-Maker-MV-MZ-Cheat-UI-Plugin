import { ParameterLabelTranslator } from '../ParameterLabelTranslator.js';

export class NuunSceneFormationTranslator extends ParameterLabelTranslator {
    getPluginName() {
        return 'NUUN_SceneFormation';
    }
    getCacheType() {
        return 'plugin_nuun_scene_formation';
    }
    getTextFields() {
        return ['BattleMemberName', 'MemberName'];
    }
}
