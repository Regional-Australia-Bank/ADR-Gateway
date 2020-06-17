import { MetadataUpdateLog, MetadataUpdateLogManager } from "../../../../Common/Entities/MetadataUpdateLog"
import { singleton } from "tsyringe";

@singleton()
class MetadataUpdater {
    constructor(private manager:MetadataUpdateLogManager) {}

    async log(): Promise<MetadataUpdateLog> {
        return await this.manager.update();
    }
}

export {MetadataUpdater}