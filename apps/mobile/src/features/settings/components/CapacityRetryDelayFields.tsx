import {
  CapacityRetryDelay,
  MAX_CAPACITY_RETRY_DELAY_MINUTES,
  MIN_CAPACITY_RETRY_DELAY_MINUTES,
} from "@t3tools/contracts";
import * as Equal from "effect/Equal";
import * as Schema from "effect/Schema";
import { useState } from "react";
import { View } from "react-native";

import { AppText as Text, AppTextInput } from "../../../components/AppText";
import { MaterialButton } from "../../../components/MaterialButton";

const isCapacityRetryDelay = Schema.is(CapacityRetryDelay);

export function CapacityRetryDelayFields({
  value,
  disabled,
  onApply,
}: {
  readonly value: CapacityRetryDelay | null;
  readonly disabled: boolean;
  readonly onApply: (delay: CapacityRetryDelay) => void;
}) {
  const [minimum, setMinimum] = useState(value ? String(value.minMinutes) : "");
  const [maximum, setMaximum] = useState(value ? String(value.maxMinutes) : "");
  const delay = { minMinutes: Number(minimum), maxMinutes: Number(maximum) };
  const valid = isCapacityRetryDelay(delay);
  const changed = !Equal.equals(delay, value);
  const editing = minimum !== "" || maximum !== "";

  return (
    <View className="gap-3 px-4 py-4">
      <Text className="text-lg text-foreground android:text-base">Retry delay</Text>
      <Text className="text-sm text-foreground-muted">
        Choose a random wait for each new capacity error. Scheduled retries keep their current
        times.
      </Text>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-2">
          <Text className="text-sm text-foreground-muted">Minimum (minutes)</Text>
          <AppTextInput
            keyboardType="number-pad"
            value={minimum}
            placeholder={value === null ? "Mixed" : undefined}
            editable={!disabled}
            accessibilityLabel="Minimum capacity retry delay in minutes"
            onChangeText={setMinimum}
          />
        </View>
        <View className="flex-1 gap-2">
          <Text className="text-sm text-foreground-muted">Maximum (minutes)</Text>
          <AppTextInput
            keyboardType="number-pad"
            value={maximum}
            placeholder={value === null ? "Mixed" : undefined}
            editable={!disabled}
            accessibilityLabel="Maximum capacity retry delay in minutes"
            onChangeText={setMaximum}
          />
        </View>
      </View>
      <Text accessibilityLiveRegion="polite" className="text-sm text-foreground-muted">
        {editing && !valid
          ? `Enter whole minutes from ${MIN_CAPACITY_RETRY_DELAY_MINUTES} to ${MAX_CAPACITY_RETRY_DELAY_MINUTES}, with minimum no greater than maximum.`
          : "Set both values to the same number for a fixed delay."}
      </Text>
      <MaterialButton
        label="Apply retry delay"
        disabled={disabled || !valid || !changed}
        onPress={() => {
          if (!disabled && valid && changed) onApply(delay);
        }}
      />
    </View>
  );
}
