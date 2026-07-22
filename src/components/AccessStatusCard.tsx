import { View, Text } from "react-native";
import React from "react";
import { Card } from "./Card";
import { RoleBadge } from "./RoleBadge";

type AccessStatusCardProps = {
  hasAccess: boolean;
  reason?: string;
  matchedRoles: string[];
  requiredRoles: string[];
  confidence?: string;
  discrepancy?: {
    type: 'rpc' | 'attestation';
    backendDecision: boolean;
    otherDecision: boolean;
  };
};

export const AccessStatusCard = ({
  hasAccess,
  reason,
  matchedRoles,
  requiredRoles,
  confidence,
  discrepancy,
}: AccessStatusCardProps) => {
  // Determine confidence label and styling
  const getConfidenceDisplay = () => {
    if (!confidence) return null;
    
    const isDiscrepancyCase = confidence === 'rpc_disagreed' || confidence === 'attestation_disagreed';
    const isOfflineCase = confidence === 'backend_unavailable_attestation_verified' || confidence === 'partial_attestation_only';
    const isServerUnavailable = confidence === 'backend_unavailable_rpc_verified' || confidence === 'backend_unavailable_attestation_verified';
    
    let label = '';
    let bgColor = '';
    let textColor = '';
    
    switch (confidence) {
      case 'backend_verified':
        label = 'Verified via server';
        bgColor = 'bg-success/10';
        textColor = 'text-success';
        break;
      case 'rpc_corroborated':
        label = 'Verified via server & blockchain';
        bgColor = 'bg-success/10';
        textColor = 'text-success';
        break;
      case 'attestation_corroborated':
        label = 'Verified via server & attestation';
        bgColor = 'bg-success/10';
        textColor = 'text-success';
        break;
      case 'backend_unavailable_rpc_verified':
        label = 'Verified via blockchain (server unavailable)';
        bgColor = 'bg-amber-50';
        textColor = 'text-amber-700';
        break;
      case 'backend_unavailable_attestation_verified':
        label = 'Verified offline via attestation (server unavailable)';
        bgColor = 'bg-amber-50';
        textColor = 'text-amber-700';
        break;
      case 'partial_rpc_only':
        label = 'Verified via blockchain only';
        bgColor = 'bg-amber-50';
        textColor = 'text-amber-700';
        break;
      case 'partial_attestation_only':
        label = 'Verified offline via attestation only';
        bgColor = 'bg-amber-50';
        textColor = 'text-amber-700';
        break;
      case 'rpc_disagreed':
        label = 'Server & blockchain disagree - using server result';
        bgColor = 'bg-error/10';
        textColor = 'text-error';
        break;
      case 'attestation_disagreed':
        label = 'Server & attestation disagree - using server result';
        bgColor = 'bg-error/10';
        textColor = 'text-error';
        break;
      case 'all_sources_failed':
        label = 'Unable to verify access';
        bgColor = 'bg-error/10';
        textColor = 'text-error';
        break;
      default:
        return null;
    }
    
    return { label, bgColor, textColor, isDiscrepancyCase, isOfflineCase, isServerUnavailable };
  };

  const confidenceDisplay = getConfidenceDisplay();

  return (
    <Card className={`border-2 ${hasAccess ? "border-success" : "border-error"}`}>
      {/* Discrepancy Warning Banner */}
      {discrepancy && (
        <View className="bg-error/10 border-b border-error/30 p-4" accessibilityRole="alert">
          <Text className="text-error font-bold mb-1">⚠️ Verification Discrepancy Detected</Text>
          <Text className="text-error/80 text-sm">
            Server granted access but {discrepancy.type === 'rpc' ? 'blockchain' : 'attestation'} verification disagreed.
            This may indicate a configuration issue. Please contact support if this persists.
          </Text>
        </View>
      )}

      {/* Offline Indicator */}
      {confidenceDisplay?.isOfflineCase && (
        <View className="bg-amber-50 border-b border-amber-200 p-3">
          <Text className="text-amber-700 text-sm font-medium">📴 Offline Mode</Text>
          <Text className="text-amber-600 text-xs mt-1">
            Access verified using cached data. Server confirmation pending.
          </Text>
        </View>
      )}

      <View className="items-center mb-6" accessibilityLiveRegion="polite">
        <View
          className={`w-16 h-16 rounded-full items-center justify-center mb-4 ${
            hasAccess ? "bg-success" : "bg-error"
          }`}
          accessibilityLabel={hasAccess ? "Access granted" : "Access denied"}
        >
          <Text className="text-white text-3xl">{hasAccess ? "✓" : "✕"}</Text>
        </View>
        <Text className={`text-2xl font-bold ${hasAccess ? "text-success" : "text-error"}`}>
          {hasAccess ? "Access Granted" : "Access Denied"}
        </Text>
        {reason && <Text className="text-text-muted mt-2 text-center">{reason}</Text>}
        
        {/* Confidence Level Display */}
        {confidenceDisplay && (
          <View className={`mt-3 px-3 py-1.5 rounded-full ${confidenceDisplay.bgColor}`}>
            <Text className={`text-xs font-medium ${confidenceDisplay.textColor}`}>
              {confidenceDisplay.label}
            </Text>
          </View>
        )}
      </View>

      <View className="border-t border-border pt-4">
        <Text className="text-text font-bold mb-3">Requirements</Text>
        <View className="flex-row flex-wrap">
          {requiredRoles.length > 0 ? (
            requiredRoles.map((role) => <RoleBadge key={role} name={role} />)
          ) : (
            <Text className="text-text-muted italic">No role requirements specified</Text>
          )}
        </View>

        {hasAccess && matchedRoles.length > 0 && (
          <View className="mt-4">
            <Text className="text-success font-bold mb-3">Matched Roles</Text>
            <View className="flex-row flex-wrap">
              {matchedRoles.map((role) => (
                <RoleBadge key={role} name={role} />
              ))}
            </View>
          </View>
        )}
      </View>
    </Card>
  );
};
