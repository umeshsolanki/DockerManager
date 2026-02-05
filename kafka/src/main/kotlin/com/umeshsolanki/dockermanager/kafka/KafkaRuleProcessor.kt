package com.umeshsolanki.dockermanager.kafka

import kotlinx.serialization.json.*
import org.slf4j.LoggerFactory

object KafkaRuleProcessor {
    private val logger = LoggerFactory.getLogger(KafkaRuleProcessor::class.java)

    fun process(topic: String, value: String, rules: List<KafkaRule>): KafkaProcessedEvent {
        val appliedRules = mutableListOf<String>()
        var currentValue = value

        val activeRules = rules.filter { it.enabled && it.topic == topic }
        
        for (rule in activeRules) {
            try {
                if (evaluateCondition(currentValue, rule.condition)) {
                    currentValue = applyTransformations(currentValue, rule.transformations)
                    appliedRules.add(rule.id)
                }
            } catch (e: Exception) {
                logger.error("Error applying rule ${rule.name}", e)
            }
        }

        return KafkaProcessedEvent(
            originalTopic = topic,
            originalValue = value,
            processedValue = currentValue,
            appliedRules = appliedRules
        )
    }

    private fun evaluateCondition(jsonString: String, condition: String): Boolean {
        if (condition.isBlank()) return true
        
        try {
            val json = Json.parseToJsonElement(jsonString).jsonObject
            // Simple parser for "field == 'value'" or "field == value"
            val parts = condition.split("==").map { it.trim() }
            if (parts.size == 2) {
                val field = parts[0]
                val expectedValue = parts[1].replace("'", "").replace("\"", "")
                
                val actualValue = json[field]?.jsonPrimitive?.content ?: return false
                return actualValue == expectedValue
            }
            
            // Support "field > value" etc if needed
            // For now, only == is implemented as per user example
        } catch (e: Exception) {
            logger.error("Failed to evaluate condition: $condition", e)
        }
        
        return false
    }

    private fun applyTransformations(jsonString: String, transformations: Map<String, String>): String {
        if (transformations.isEmpty()) return jsonString
        
        try {
            val json = Json.parseToJsonElement(jsonString).jsonObject
            val mutableJson = json.toMutableMap()
            
            for ((field, value) in transformations) {
                // Determine if value is number or string
                val intValue = value.toIntOrNull()
                if (intValue != null) {
                    mutableJson[field] = JsonPrimitive(intValue)
                } else {
                    mutableJson[field] = JsonPrimitive(value)
                }
            }
            
            return JsonObject(mutableJson).toString()
        } catch (e: Exception) {
            logger.error("Failed to apply transformations", e)
        }
        
        return jsonString
    }
}
