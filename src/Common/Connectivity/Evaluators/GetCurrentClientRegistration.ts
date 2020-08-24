import { SoftwareProductConnectivityConfig, DataHolderRegisterMetadata } from "../Types";
import { DataHolderRegistrationManager } from "../../Entities/DataHolderRegistration";

export const GetCurrentClientRegistration = async (registrationManager: DataHolderRegistrationManager, $: {
  SoftwareProductConfig: SoftwareProductConnectivityConfig,
  DataHolderBrandMetadata: DataHolderRegisterMetadata
}) => {
  return await registrationManager.GetActiveRegistrationByIds($.SoftwareProductConfig.ProductId,$.DataHolderBrandMetadata.dataHolderBrandId);
}