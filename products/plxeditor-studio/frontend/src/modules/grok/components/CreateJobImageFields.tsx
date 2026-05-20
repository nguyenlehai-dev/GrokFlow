import type { UseFormRegister } from "react-hook-form";
import type { CreateJobForm } from "./CreateJobForm.types";

export function CreateJobImageFields({
  register, canQualityHigh,
}: {
  register: UseFormRegister<CreateJobForm>;
  canQualityHigh: boolean;
}) {
  return (
    <div>
      <label className="text-sm font-medium">Chất lượng</label>
      <select className="input" {...register("quality")}>
        <option value="speed">Speed (nhanh)</option>
        <option value="quality" disabled={!canQualityHigh}>
          Quality (chậm, đẹp hơn){!canQualityHigh ? " 🔒" : ""}
        </option>
      </select>
    </div>
  );
}
