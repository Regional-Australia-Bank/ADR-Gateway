import { singleton } from "tsyringe";
import { MetadataUpdateLogManager, MetadataUpdateLog } from "../../Entities/MetadataUpdateLog";

@singleton()
class MetadataUpdater {
    constructor(private manager:MetadataUpdateLogManager) {}

    async log(): Promise<MetadataUpdateLog> {
        return await this.manager.update();
    }
}

export {MetadataUpdater}