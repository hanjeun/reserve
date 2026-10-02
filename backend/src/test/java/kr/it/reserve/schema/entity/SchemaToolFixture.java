package kr.it.reserve.schema.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "schema_fixture")
public class SchemaToolFixture {
    @Id private Long id;
    @Column(length = 32) private String label;
}
